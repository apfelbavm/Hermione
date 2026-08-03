import { google, type sheets_v4 } from "googleapis";
import { googleErrorMessage, serviceAccountClient, oauth2Client, type GoogleAuthClient } from "./googleAuthManager.ts";
import type { GoogleServiceAccountCredentialData, GoogleOAuth2CredentialData } from "../credentials/types";

/** Every Google Sheets node (get/update/append/clear values, create spreadsheet, add/delete sheet)
 * needs the same boilerplate: call one googleapis Sheets v4 route and turn either a result or a
 * thrown GaxiosError into a plain {success, error} shape. Centralized here once instead of
 * repeated per node (see nodes/google.ts). */

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export interface GoogleSheetsOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface GoogleSheetsValuesResult extends GoogleSheetsOpResult {
  valuesJson: string;
}

export interface GoogleSheetsUpdateResult extends GoogleSheetsOpResult {
  updatedCells: number;
}

export interface GoogleSheetsCreateResult extends GoogleSheetsOpResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
}

export interface GoogleSheetsSheetResult extends GoogleSheetsOpResult {
  sheetId: number;
}

export interface GoogleSheetsMetadataResult extends GoogleSheetsOpResult {
  title: string;
  sheetTitlesJson: string;
}

const managerCache = new Map<string, GoogleSheetsManager>();

export class GoogleSheetsManager {
  private readonly client: sheets_v4.Sheets;

  private constructor(auth: GoogleAuthClient) {
    this.client = google.sheets({ version: "v4", auth });
  }

  static forServiceAccount(data: GoogleServiceAccountCredentialData): GoogleSheetsManager {
    const key = `sa:${data.serviceAccountKeyJson}:${data.impersonateUser}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleSheetsManager(serviceAccountClient(data, SCOPES));
      managerCache.set(key, manager);
    }
    return manager;
  }

  static forOAuth2(data: GoogleOAuth2CredentialData): GoogleSheetsManager {
    const key = `oauth2:${data.clientId}:${data.refreshToken}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleSheetsManager(oauth2Client(data));
      managerCache.set(key, manager);
    }
    return manager;
  }

  async getValues(spreadsheetId: string, range: string): Promise<GoogleSheetsValuesResult> {
    try {
      const res = await this.client.spreadsheets.values.get({ spreadsheetId, range });
      return { success: true, valuesJson: JSON.stringify(res.data.values ?? []), error: "" };
    } catch (err) {
      return { success: false, valuesJson: "[]", error: googleErrorMessage(err) };
    }
  }

  async updateValues(spreadsheetId: string, range: string, valuesJson: string): Promise<GoogleSheetsUpdateResult> {
    try {
      const values = JSON.parse(valuesJson || "[]") as unknown[][];
      const res = await this.client.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values },
      });
      return { success: true, updatedCells: res.data.updatedCells ?? 0, error: "" };
    } catch (err) {
      return { success: false, updatedCells: 0, error: googleErrorMessage(err) };
    }
  }

  async appendValues(spreadsheetId: string, range: string, valuesJson: string): Promise<GoogleSheetsUpdateResult> {
    try {
      const values = JSON.parse(valuesJson || "[]") as unknown[][];
      const res = await this.client.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values },
      });
      return { success: true, updatedCells: res.data.updates?.updatedCells ?? 0, error: "" };
    } catch (err) {
      return { success: false, updatedCells: 0, error: googleErrorMessage(err) };
    }
  }

  async clearValues(spreadsheetId: string, range: string): Promise<GoogleSheetsOpResult> {
    try {
      await this.client.spreadsheets.values.clear({ spreadsheetId, range });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  async createSpreadsheet(title: string): Promise<GoogleSheetsCreateResult> {
    try {
      const res = await this.client.spreadsheets.create({
        requestBody: { properties: { title } },
      });
      return {
        success: true,
        spreadsheetId: res.data.spreadsheetId ?? "",
        spreadsheetUrl: res.data.spreadsheetUrl ?? "",
        error: "",
      };
    } catch (err) {
      return { success: false, spreadsheetId: "", spreadsheetUrl: "", error: googleErrorMessage(err) };
    }
  }

  async addSheet(spreadsheetId: string, title: string): Promise<GoogleSheetsSheetResult> {
    try {
      const res = await this.client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] },
      });
      return {
        success: true,
        sheetId: res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0,
        error: "",
      };
    } catch (err) {
      return { success: false, sheetId: 0, error: googleErrorMessage(err) };
    }
  }

  async deleteSheet(spreadsheetId: string, sheetId: number): Promise<GoogleSheetsOpResult> {
    try {
      await this.client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ deleteSheet: { sheetId } }] },
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  async getMetadata(spreadsheetId: string): Promise<GoogleSheetsMetadataResult> {
    try {
      const res = await this.client.spreadsheets.get({ spreadsheetId });
      const sheetTitles = (res.data.sheets ?? []).map((s) => s.properties?.title ?? "");
      return {
        success: true,
        title: res.data.properties?.title ?? "",
        sheetTitlesJson: JSON.stringify(sheetTitles),
        error: "",
      };
    } catch (err) {
      return { success: false, title: "", sheetTitlesJson: "[]", error: googleErrorMessage(err) };
    }
  }
}
