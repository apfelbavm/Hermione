import { registerEnumType } from "../engine/enumRegistry";

export const ODATA_PAGINATION_TYPE_ENUM_TYPE = "odataPaginationType";

registerEnumType({
  id: ODATA_PAGINATION_TYPE_ENUM_TYPE,
  label: "OData Pagination Type",
  category: "OData",
  values: [
    { id: "Client", label: "Client" },
    { id: "Server", label: "Server" },
  ],
});
