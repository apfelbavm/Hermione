import { registerEnumType } from "../engine/enumRegistry";

export const MONGO_RETURN_DOCUMENT_ENUM_TYPE = "mongoReturnDocument";

registerEnumType({
  id: MONGO_RETURN_DOCUMENT_ENUM_TYPE,
  label: "MongoDB Return Document",
  category: "MongoDB",
  values: [
    { id: "before", label: "Before Update" },
    { id: "after", label: "After Update" },
  ],
});
