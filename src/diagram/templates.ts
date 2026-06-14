export interface DiagramTemplate {
  id: string;
  name: string;
  hint: string;
  source: string;
}

export const TEMPLATES: DiagramTemplate[] = [
  {
    id: "architecture",
    name: "System architecture",
    hint: "Services, groups, a datastore",
    source: `direction: right

Clients:
  Web app
  Mobile app

Backend:
  api-gateway / Auth + routing
  service-core / Business logic
  Postgres #db

Web app -> api-gateway
Mobile app -> api-gateway
api-gateway -> service-core
service-core -> Postgres
service-core ..>|cache reads| Redis #db`,
  },
  {
    id: "pipeline",
    name: "Data pipeline",
    hint: "Source → transform → store → consumer",
    source: `direction: right

Source API -> Ingest / Batch loader
Ingest -> Transform / Clean + normalize
Transform -> Warehouse #db
Warehouse ->|nightly| Dashboard
Warehouse ..>|export| Data lake #db`,
  },
  {
    id: "userflow",
    name: "User flow",
    hint: "Steps and branches",
    source: `direction: down

Landing page -> Sign up
Sign up ->|valid| Onboarding
Sign up ->|invalid| Show error #ghost
Show error -> Sign up
Onboarding -> Dashboard`,
  },
  {
    id: "orgchart",
    name: "Org chart",
    hint: "Top-down hierarchy",
    source: `direction: down

CEO -> CTO, CFO, COO
CTO -> Eng lead, Design lead
Eng lead -> Frontend, Backend
Design lead -> Product design, Brand`,
  },
  {
    id: "classes",
    name: "Class diagram",
    hint: "Boxes with fields (uses rows)",
    source: `direction: down

User / id, name, email
Order / id, total, placedAt
Product / id, title, price

User -->|places| Order
Order -->|contains| Product`,
  },
  {
    id: "requestflow",
    name: "Request flow",
    hint: "Labeled step-by-step sequence",
    source: `direction: right

Client ->|1. request| Gateway
Gateway ->|2. authenticate| Auth #pill
Gateway ->|3. forward| Service
Service ->|4. query| Database #db
Database ->|5. rows| Service
Service ->|6. response| Client`,
  },
];
