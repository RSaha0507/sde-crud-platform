import { useState } from "react";
import { api } from "../api/client";
import { Button, Card, Checkbox, Field, SelectField } from "../components/ui";

const permissions = ["all", "create", "read", "update", "delete"];
const emptyField = () => ({
  name: "",
  type: "string",
  required: false,
  unique: false,
});

export default function ModelEditor({ onPublish }) {
  const [model, setModel] = useState({
    name: "",
    tableName: "",
    ownerField: "",
    fields: [{ name: "name", type: "string", required: true, unique: false }],
    rbac: {
      Admin: ["all"],
      Manager: ["create", "read", "update"],
      Viewer: ["read"],
    },
  });
  const [state, setState] = useState({
    loading: false,
    error: "",
    success: "",
  });
  const update = (key, value) =>
    setModel((current) => ({ ...current, [key]: value }));
  const updateField = (index, key, value) =>
    update(
      "fields",
      model.fields.map((field, i) =>
        i === index ? { ...field, [key]: value } : field,
      ),
    );
  const submit = async (event) => {
    event.preventDefault();
    if (!model.name.trim() || model.fields.some((field) => !field.name.trim()))
      return setState({
        loading: false,
        error: "Model and field names are required.",
        success: "",
      });
    if (
      new Set(model.fields.map((field) => field.name.trim())).size !==
      model.fields.length
    )
      return setState({
        loading: false,
        error: "Field names must be unique.",
        success: "",
      });
    setState({ loading: true, error: "", success: "" });
    try {
      const result = await api.publishModel({
        ...model,
        name: model.name.trim(),
        tableName: model.tableName || undefined,
        ownerField: model.ownerField || undefined,
      });
      setState({ loading: false, error: "", success: result.message });
      onPublish();
    } catch (error) {
      setState({ loading: false, error: error.message, success: "" });
    }
  };
  return (
    <Card title="Model Editor">
      <form onSubmit={submit}>
        {state.error && (
          <div className="notice error" role="alert">
            {state.error}
          </div>
        )}
        {state.success && (
          <div className="notice success" role="status">
            {state.success}
          </div>
        )}
        <div className="grid three">
          <Field
            label="Model name"
            required
            value={model.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Product"
          />
          <Field
            label="Table name (optional)"
            value={model.tableName}
            onChange={(e) => update("tableName", e.target.value)}
          />
          <Field
            label="Owner field (optional)"
            value={model.ownerField}
            onChange={(e) => update("ownerField", e.target.value)}
          />
        </div>
        <h3>Fields</h3>
        {model.fields.map((field, index) => (
          <div className="field-row" key={index}>
            <Field
              label="Name"
              required
              value={field.name}
              onChange={(e) => updateField(index, "name", e.target.value)}
            />
            <SelectField
              label="Type"
              value={field.type}
              onChange={(e) => updateField(index, "type", e.target.value)}
            >
              <option>string</option>
              <option>number</option>
              <option>boolean</option>
              <option>text</option>
              <option>relation</option>
            </SelectField>
            <Checkbox
              label="Required"
              checked={field.required}
              onChange={(e) => updateField(index, "required", e.target.checked)}
            />
            <Checkbox
              label="Unique"
              checked={field.unique}
              onChange={(e) => updateField(index, "unique", e.target.checked)}
            />
            <Button
              variant="danger"
              disabled={model.fields.length === 1}
              onClick={() =>
                update(
                  "fields",
                  model.fields.filter((_, i) => i !== index),
                )
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          onClick={() => update("fields", [...model.fields, emptyField()])}
        >
          + Add field
        </Button>
        <h3>Role-based access control</h3>
        <div className="grid three">
          {Object.keys(model.rbac).map((role) => (
            <div className="role" key={role}>
              <strong>{role}</strong>
              {permissions.map((permission) => (
                <Checkbox
                  key={permission}
                  label={permission}
                  checked={model.rbac[role].includes(permission)}
                  onChange={(e) =>
                    update("rbac", {
                      ...model.rbac,
                      [role]: e.target.checked
                        ? [...model.rbac[role], permission]
                        : model.rbac[role].filter(
                            (item) => item !== permission,
                          ),
                    })
                  }
                />
              ))}
            </div>
          ))}
        </div>
        <div className="actions">
          <Button type="submit" disabled={state.loading}>
            {state.loading ? "Publishing…" : "Publish model"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
