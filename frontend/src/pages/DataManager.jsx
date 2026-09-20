import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import {
  Button,
  Card,
  Checkbox,
  Field,
  SelectField,
  Status,
} from "../components/ui";

function RecordForm({ model, record, onClose, onSave }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      model.fields.map((f) => [
        f.name,
        record?.[f.name] ?? (f.type === "boolean" ? false : ""),
      ]),
    ),
  );
  const [error, setError] = useState("");
  const save = async (event) => {
    event.preventDefault();
    setError("");
    try {
      if (record)
        await api.updateData(model.name.toLowerCase(), record.id, values);
      else await api.createData(model.name.toLowerCase(), values);
      onSave();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-title"
      >
        <form onSubmit={save}>
          <h2 id="record-title">
            {record ? "Edit" : "Create"} {model.name}
          </h2>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {model.fields.map((field) =>
            field.type === "boolean" ? (
              <Checkbox
                key={field.name}
                label={field.name}
                checked={!!values[field.name]}
                onChange={(e) =>
                  setValues({ ...values, [field.name]: e.target.checked })
                }
              />
            ) : (
              <Field
                key={field.name}
                label={field.name}
                required={field.required}
                type={field.type === "number" ? "number" : "text"}
                value={values[field.name]}
                onChange={(e) =>
                  setValues({
                    ...values,
                    [field.name]:
                      field.type === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            ),
          )}
          <div className="actions">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DataManager({ models }) {
  const [selected, setSelected] = useState(models[0]?.name || "");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(undefined);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const model = models.find((item) => item.name === selected);
  const pageSize = 10;
  const load = useCallback(async () => {
    if (!model) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await api.getData(model.name.toLowerCase()));
      setPage(1);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [model]);
  useEffect(() => {
    load();
  }, [load]);
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        JSON.stringify(row).toLowerCase().includes(query.toLowerCase()),
      ),
    [rows, query],
  );
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const remove = async (id) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      await api.deleteData(model.name.toLowerCase(), id);
      load();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Card title="Data Manager">
      <div className="toolbar">
        <SelectField
          label="Select model"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {models.map((item) => (
            <option key={item.name}>{item.name}</option>
          ))}
        </SelectField>
        <Field
          label="Filter records"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search…"
        />
        <Button disabled={!model} onClick={() => setEditing(null)}>
          + Add new
        </Button>
      </div>
      <Status
        loading={loading}
        error={error}
        empty={!loading && !error && !visible.length}
        onRetry={load}
      />
      {!loading && !error && visible.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  {model.fields.map((f) => (
                    <th key={f.name}>{f.name}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    {model.fields.map((f) => (
                      <td key={f.name}>{String(row[f.name] ?? "")}</td>
                    ))}
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => setEditing(row)}
                      >
                        Edit
                      </Button>{" "}
                      <Button variant="danger" onClick={() => remove(row.id)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {pages}
            </span>
            <Button
              variant="secondary"
              disabled={page === pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      {editing !== undefined && (
        <RecordForm
          model={model}
          record={editing}
          onClose={() => setEditing(undefined)}
          onSave={() => {
            setEditing(undefined);
            load();
          }}
        />
      )}
    </Card>
  );
}
