SDE Assignment: Auto-Generated CRUD + RBAC Platform

This project is a complete, working implementation of the "Auto-Generated CRUD + RBAC Platform" assignment.

It consists of two parts:

Backend (backend folder): A Node.js/Express server that handles API requests, file persistence, database operations (SQLite), and RBAC.

Frontend (frontend folder): A single-page React application (in one HTML file) that provides the Admin UI for defining models and managing data.

Features

Model Definition UI: A React-based form to define model names, fields (with types, required, unique), and RBAC rules.

File-Based Persistence: Clicking "Publish" saves the model definition as a .json file in backend/models-json/.

Dynamic DB Schema: The backend automatically reads these .json files and creates/updates SQLite database tables to match the model definition.

Dynamic Admin API: A generic API (/admin/api/data/...) allows the frontend to manage data for any defined model.

Dynamic Public API: A dynamic, RBAC-protected public API is generated for all models (e.g., GET /api/employee).

RBAC Implementation: The public API is protected by a middleware that checks a user's role (sent via X-User-Role header) against the rbac rules in the model's .json file.

Admin Data Interface: A full-featured data manager in the UI to view, create, edit, and delete records for any published model.

How to Run the System

You must run both the backend server and the frontend UI.

1. Run the Backend Server

Navigate to the backend folder you created.

cd path/to/backend


Install the required Node.js dependencies:

npm install express cors sqlite3


Run the server:

node server.js


The server will start on http://localhost:4000. It will also create the models-json directory and the data.db SQLite file inside the backend folder.

2. Run the Frontend Admin UI

Navigate to the frontend folder you created.

Open the index.html file directly in your web browser (e.g., Chrome, Firefox). You can just double-click it.

The React application will load and connect to the backend server at http://localhost:4000.

How to Use the Platform (Suggested Flow)

Open the UI: Open frontend/index.html in your browser. You will see the "Model Editor".

Define a Model:

Fill out the form. For example:

Model Name: Employee

Fields:

(default) name | string | required

(add new) age | number

(add new) isActive | boolean

RBAC: Leave the defaults (e.g., Viewer can only read).

Publish the Model: Click the "Publish Model" button.

Backend: The server saves Employee.json to backend/models-json/ and creates the employees table in the data.db database.

Manage Data:

Click the "Data Manager" tab at the top.

"Employee" will now be in the "Select Model" dropdown.

Click "+ Add New Employee".

Fill out the form (e.g., Name: "Jane Doe", Age: 30, isActive: true) and click "Save".

You will see the new record in the table.

Test the Public API:

Use a tool like Postman, curl, or your browser's fetch console.

Test 1: (Viewer - Read - Allowed)

# Viewers can 'read'
curl http://localhost:4000/api/employee -H "X-User-Role: Viewer"


Result: [{"id":1, "name":"Jane Doe", "age":30, "isActive":1}]

Test 2: (Viewer - Create - Denied)

# Viewers cannot 'create'
curl -X POST http://localhost:4000/api/employee \
     -H "X-User-Role: Viewer" \
     -H "Content-Type: application/json" \
     -d '{"name": "John Smith", "age": 40, "isActive": true}'


Result: {"message":"Forbidden: You do not have permission."}

Test 3: (Manager - Create - Allowed)

# Managers can 'create'
curl -X POST http://localhost:4000/api/employee \
     -H "X-User-Role: Manager" \
     -H "Content-Type: application/json" \
     -d '{"name": "John Smith", "age": 40, "isActive": true}'


Result: {"id":2, "name":"John Smith", "age":40, "isActive":true}
