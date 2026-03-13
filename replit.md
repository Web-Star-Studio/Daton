# Daton — ESG, Quality & Compliance Platform

## Overview

Daton is a multi-tenant SaaS platform designed for comprehensive ESG, quality, compliance, and operations management. The platform's primary goal is to streamline regulatory adherence and operational excellence for businesses. Currently, it focuses on the SGQ (Sistema de Gestão de Qualidade) module, encompassing key submodules like "Legislações" (ISO 14001 compliance), "Colaboradores" (ISO 9001:2015 §7.2/§7.3 for employee management), and "Documentação" (ISO 9001:2015 §7.5 for document control). The long-term vision is to expand into a full-suite solution addressing various aspects of governance, risk, and compliance (GRC), with a strong emphasis on user experience and data-driven insights.

## User Preferences

I prefer iterative development, focusing on one feature or bug fix at a time. Please explain your thought process and proposed changes clearly before implementation. I value clean, readable code and comprehensive tests.

## System Architecture

The Daton platform is built as a pnpm workspace monorepo utilizing TypeScript. The frontend is developed with React, Vite, Tailwind CSS for styling, wouter for routing, and React Query for data fetching. The backend API is powered by Express 5, interacting with a PostgreSQL database managed through Drizzle ORM. Authentication is handled via JWT, with tokens stored securely in `localStorage`. Data validation is enforced using Zod, integrated with Drizzle. API client code is generated from an OpenAPI specification using Orval, ensuring type safety and consistency.

Key architectural decisions include:
- **Multi-tenancy:** Each user belongs to an organization (tenant), and all data queries are strictly scoped by `orgId` to maintain data isolation.
- **Modular Design:** The monorepo structure promotes modularity, with distinct packages for the API server, web frontend, and shared libraries (e.g., `api-spec`, `db`, `api-client-react`).
- **UI/UX:** The design philosophy follows Apple Human Interface Guidelines, aiming for a minimal and intuitive user experience. This is reflected in the layout of key features like unit management, employee details, and document workflows, emphasizing clarity and ease of use.
- **AI Integration:** An AI assistant, "Daton AI," is integrated for natural language interaction, leveraging OpenAI's gpt-4o-mini via Replit AI Integrations. It includes a read-only database query tool with multi-tenant isolation and uses Server-Sent Events (SSE) for real-time responses. The AI assists with tasks like generating legislation tags and answering compliance-related questions.
- **Document Control Workflow:** A robust document management system with versioning, approval workflows (draft -> in_review -> approved/rejected -> distributed -> acknowledged), and role-based access for elaborators, approvers, and recipients.
- **Compliance Tagging:** A system where questionnaire responses generate compliance tags for units, enabling dynamic filtering of relevant legislations based on a unit's profile.

- **User Invitations:** Email-based invitation system using Resend. Admins can invite users to their organization via email. Invitations use a 32-byte random token with 7-day expiry. The accept flow creates a new user account and logs them in automatically. Backend uses DB transactions for atomic invite acceptance. Expired invites allow re-invitation.

## External Dependencies

- **PostgreSQL:** Primary relational database for all application data.
- **OpenAI (via Replit AI Integrations):** Used for the Daton AI assistant, specifically gpt-4o-mini for natural language processing and database querying.
- **Google Cloud Storage (GCS):** Utilized for secure storage of file evidence and document attachments, with presigned URLs for direct uploads.
- **Orval:** API client code generation tool, based on OpenAPI specifications.
- **Resend (via Replit Integrations):** Email delivery service for sending invitation emails.
- **Tailwind CSS:** Utility-first CSS framework for rapid UI development.
- **React Query:** Library for data fetching, caching, and state management in the frontend.