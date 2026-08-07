import { registerEnumType } from "@hermione/graph/engine/enumRegistry";

export const AZURE_STORAGE_CONTAINER_ACCESS_ENUM_TYPE = "azureStorageContainerAccess";
export const AZURE_STORAGE_BLOB_TIER_ENUM_TYPE = "azureStorageBlobTier";

registerEnumType({
  id: AZURE_STORAGE_CONTAINER_ACCESS_ENUM_TYPE,
  label: "Azure Storage Container Access",
  category: "Azure",
  values: [
    { id: "private", label: "Private" },
    { id: "blob", label: "Blob" },
    { id: "container", label: "Container" },
  ],
});

registerEnumType({
  id: AZURE_STORAGE_BLOB_TIER_ENUM_TYPE,
  label: "Azure Storage Blob Tier",
  category: "Azure",
  values: [
    { id: "", label: "(default)" },
    { id: "Hot", label: "Hot" },
    { id: "Cool", label: "Cool" },
    { id: "Cold", label: "Cold" },
    { id: "Archive", label: "Archive" },
  ],
});
