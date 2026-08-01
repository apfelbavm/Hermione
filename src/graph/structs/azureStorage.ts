import { registerStructType } from "../../engine/structRegistry";
import { i18n } from "@i18n";

export const TIER_OPTIONS = ["", "Hot", "Cool", "Cold", "Archive"];

// The concrete example: Upload Blob's "options" pin is a struct (see engine/structRegistry.ts and
// nodes/struct.ts's generic Make/Break Struct nodes) instead of one bare contentType string, so a
// flow can build one full BlockBlobUploadOptions-shaped value with Make Struct (or plug in a
// literal built right on this pin) and reuse it across multiple uploads.
export const UPLOAD_OPTIONS_STRUCT_TYPE = "azureStorageBlobUploadOptions";

// Same reasoning applies to every multi-field result below (container/blob properties, account
// info): one struct-typed output pin instead of a loose pin per field, so a flow can pass the
// whole result around (or Break Struct it) rather than wiring each field separately.
export const CONTAINER_PROPERTIES_STRUCT_TYPE =
  "azureStorageContainerProperties";
export const BLOB_PROPERTIES_STRUCT_TYPE = "azureStorageBlobProperties";
export const ACCOUNT_INFO_STRUCT_TYPE = "azureStorageAccountInfo";

registerStructType({
  id: UPLOAD_OPTIONS_STRUCT_TYPE,
  label: i18n.nodes.azureStorage.uploadOptions.label,
  category: "Azure",
  fields: [
    {
      id: "contentType",
      label: i18n.nodes.azureStorage.uploadOptions.pin_content_type,
      type: "string",
      defaultValue: "",
    },
    {
      id: "cacheControl",
      label: i18n.nodes.azureStorage.uploadOptions.pin_cache_control,
      type: "string",
      defaultValue: "",
    },
    {
      id: "contentEncoding",
      label: i18n.nodes.azureStorage.uploadOptions.pin_content_encoding,
      type: "string",
      defaultValue: "",
    },
    {
      id: "contentLanguage",
      label: i18n.nodes.azureStorage.uploadOptions.pin_content_language,
      type: "string",
      defaultValue: "",
    },
    {
      id: "contentDisposition",
      label: i18n.nodes.azureStorage.uploadOptions.pin_content_disposition,
      type: "string",
      defaultValue: "",
    },
    {
      id: "tier",
      label: i18n.nodes.azureStorage.uploadOptions.pin_tier,
      type: "string",
      defaultValue: TIER_OPTIONS[0],
      options: TIER_OPTIONS,
    },
    {
      id: "metadata",
      label: i18n.nodes.azureStorage.__shared.pin_metadata,
      type: "string",
      container: "map",
      keyType: "string",
      defaultValue: [],
    },
  ],
});

registerStructType({
  id: CONTAINER_PROPERTIES_STRUCT_TYPE,
  label: i18n.nodes.azureStorage.containerProperties.label,
  category: "Azure",
  fields: [
    {
      id: "etag",
      label: i18n.nodes.azureStorage.__shared.pin_etag,
      type: "string",
      defaultValue: "",
    },
    {
      id: "lastModified",
      label: i18n.nodes.azureStorage.__shared.pin_last_modified,
      type: "string",
      defaultValue: "",
    },
    {
      id: "publicAccess",
      label: i18n.nodes.azureStorage.getContainerProperties.pin_public_access,
      type: "string",
      defaultValue: "",
    },
    {
      id: "metadata",
      label: i18n.nodes.azureStorage.__shared.pin_metadata,
      type: "string",
      container: "map",
      keyType: "string",
      defaultValue: [],
    },
  ],
});

registerStructType({
  id: BLOB_PROPERTIES_STRUCT_TYPE,
  label: i18n.nodes.azureStorage.blobProperties.label,
  category: "Azure",
  fields: [
    {
      id: "size",
      label: i18n.nodes.azureStorage.getBlobProperties.pin_size,
      type: "number",
      defaultValue: 0,
    },
    {
      id: "contentType",
      label: i18n.nodes.azureStorage.uploadOptions.pin_content_type,
      type: "string",
      defaultValue: "",
    },
    {
      id: "etag",
      label: i18n.nodes.azureStorage.__shared.pin_etag,
      type: "string",
      defaultValue: "",
    },
    {
      id: "lastModified",
      label: i18n.nodes.azureStorage.__shared.pin_last_modified,
      type: "string",
      defaultValue: "",
    },
    {
      id: "metadata",
      label: i18n.nodes.azureStorage.__shared.pin_metadata,
      type: "string",
      container: "map",
      keyType: "string",
      defaultValue: [],
    },
  ],
});

registerStructType({
  id: ACCOUNT_INFO_STRUCT_TYPE,
  label: i18n.nodes.azureStorage.accountInfo.label,
  category: "Azure",
  fields: [
    {
      id: "accountKind",
      label: i18n.nodes.azureStorage.getAccountInfo.pin_account_kind,
      type: "string",
      defaultValue: "",
    },
    {
      id: "skuName",
      label: i18n.nodes.azureStorage.getAccountInfo.pin_sku_name,
      type: "string",
      defaultValue: "",
    },
  ],
});
