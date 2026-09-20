import { useState } from "react";
import { api } from "./api/client";
import { Button, Status } from "./components/ui";
import { useAsync } from "./hooks/useAsync";
import ModelEditor from "./pages/ModelEditor";
import DataManager from "./pages/DataManager";

export default function App() {
  const [page, setPage] = useState("editor");
  const models = useAsync(api.getModels, []);
  const refresh = models.retry;
  return (
    <div className="app">
      <header>
        <h1>Auto-CRUD Platform</h1>
        <nav aria-label="Main navigation">
          <Button
            variant={page === "editor" ? "primary" : "secondary"}
            onClick={() => setPage("editor")}
          >
            Model Editor
          </Button>
          <Button
            variant={page === "manager" ? "primary" : "secondary"}
            onClick={() => setPage("manager")}
          >
            Data Manager
          </Button>
        </nav>
      </header>
      <main>
        <Status
          loading={models.loading}
          error={models.error}
          onRetry={models.retry}
        />
        {!models.loading &&
          !models.error &&
          (page === "editor" ? (
            <ModelEditor onPublish={refresh} />
          ) : models.data?.length ? (
            <DataManager models={models.data} />
          ) : (
            <p className="status">Publish a model first to manage data.</p>
          ))}
      </main>
    </div>
  );
}
