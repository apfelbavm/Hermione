import { google, type calendar_v3 } from "googleapis";
import { googleErrorMessage, serviceAccountClient, oauth2Client, type GoogleAuthClient } from "./googleAuthManager.ts";
import type { GoogleServiceAccountCredentialData, GoogleOAuth2CredentialData } from "../credentials/types";

/** Every Google Calendar node (list/get/create/update/delete events, list calendars, quick-add)
 * needs the same boilerplate: call one googleapis Calendar v3 route and turn either a result or a
 * thrown GaxiosError into a plain {success, error} shape. Centralized here once instead of
 * repeated per node (see nodes/google.ts). */

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

export interface GoogleCalendarOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  htmlLink: string;
}

export interface GoogleCalendarListEventsResult extends GoogleCalendarOpResult {
  events: GoogleCalendarEvent[];
}

export interface GoogleCalendarEventResult extends GoogleCalendarOpResult, Partial<GoogleCalendarEvent> {}

export interface GoogleCalendarEntry {
  id: string;
  summary: string;
}

export interface GoogleCalendarListCalendarsResult extends GoogleCalendarOpResult {
  calendars: GoogleCalendarEntry[];
}

function toEvent(event: calendar_v3.Schema$Event): GoogleCalendarEvent {
  return {
    id: event.id ?? "",
    summary: event.summary ?? "",
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    htmlLink: event.htmlLink ?? "",
  };
}

const managerCache = new Map<string, GoogleCalendarManager>();

export class GoogleCalendarManager {
  private readonly client: calendar_v3.Calendar;

  private constructor(auth: GoogleAuthClient) {
    this.client = google.calendar({ version: "v3", auth });
  }

  static forServiceAccount(data: GoogleServiceAccountCredentialData): GoogleCalendarManager {
    const key = `sa:${data.serviceAccountKeyJson}:${data.impersonateUser}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleCalendarManager(serviceAccountClient(data, SCOPES));
      managerCache.set(key, manager);
    }
    return manager;
  }

  static forOAuth2(data: GoogleOAuth2CredentialData): GoogleCalendarManager {
    const key = `oauth2:${data.clientId}:${data.refreshToken}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleCalendarManager(oauth2Client(data));
      managerCache.set(key, manager);
    }
    return manager;
  }

  async listEvents(calendarId: string, timeMin: string, timeMax: string, maxResults: number): Promise<GoogleCalendarListEventsResult> {
    try {
      const res = await this.client.events.list({
        calendarId: calendarId || "primary",
        timeMin: timeMin || undefined,
        timeMax: timeMax || undefined,
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
      });
      return { success: true, events: (res.data.items ?? []).map(toEvent), error: "" };
    } catch (err) {
      return { success: false, events: [], error: googleErrorMessage(err) };
    }
  }

  async getEvent(calendarId: string, eventId: string): Promise<GoogleCalendarEventResult> {
    try {
      const res = await this.client.events.get({ calendarId: calendarId || "primary", eventId });
      return { success: true, ...toEvent(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  async createEvent(calendarId: string, summary: string, start: string, end: string, description: string): Promise<GoogleCalendarEventResult> {
    try {
      const res = await this.client.events.insert({
        calendarId: calendarId || "primary",
        requestBody: {
          summary,
          description: description || undefined,
          start: { dateTime: start },
          end: { dateTime: end },
        },
      });
      return { success: true, ...toEvent(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  async updateEvent(calendarId: string, eventId: string, summary: string, start: string, end: string, description: string): Promise<GoogleCalendarEventResult> {
    try {
      const res = await this.client.events.patch({
        calendarId: calendarId || "primary",
        eventId,
        requestBody: {
          summary: summary || undefined,
          description: description || undefined,
          start: start ? { dateTime: start } : undefined,
          end: end ? { dateTime: end } : undefined,
        },
      });
      return { success: true, ...toEvent(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<GoogleCalendarOpResult> {
    try {
      await this.client.events.delete({ calendarId: calendarId || "primary", eventId });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  /** Calendar's quickAdd route parses a single free-text string ("Dinner with Sam Fri 8pm") into a
   * full event server-side via natural-language parsing, instead of requiring structured start/end. */
  async quickAddEvent(calendarId: string, text: string): Promise<GoogleCalendarEventResult> {
    try {
      const res = await this.client.events.quickAdd({ calendarId: calendarId || "primary", text });
      return { success: true, ...toEvent(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  async listCalendars(): Promise<GoogleCalendarListCalendarsResult> {
    try {
      const res = await this.client.calendarList.list();
      const calendars = (res.data.items ?? []).map((c) => ({ id: c.id ?? "", summary: c.summary ?? "" }));
      return { success: true, calendars, error: "" };
    } catch (err) {
      return { success: false, calendars: [], error: googleErrorMessage(err) };
    }
  }
}
