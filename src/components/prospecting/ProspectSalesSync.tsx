"use client";

import { useEffect, useRef } from "react";
import { useProjects } from "@/lib/store";
import { useProspecting } from "@/lib/prospecting-store";
import {
  ProspectCompany,
  ProspectContact,
  PROSPECT_TO_PROJECT_MARKET,
  PROSPECT_TO_PROJECT_SERIES,
} from "@/lib/prospecting-types";

/**
 * Keeps Prospecting in sync with linked Sales Projects (e.g. cancelled → not interested).
 */
export function ProspectSalesSync() {
  const { projects, ready: projectsReady } = useProjects();
  const { ready, companies, syncFromSalesProject } = useProspecting();
  const lastAppliedRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!ready || !projectsReady) return;

    for (const company of companies) {
      const projectId = company.promotedProjectId;
      if (!projectId) continue;
      const project = projects.find((p) => p.id === projectId);
      if (!project) continue;

      const desired =
        project.stage === "cancelled" ? "cancelled" : "active";
      const applied = lastAppliedRef.current.get(projectId);

      const needsCancel =
        desired === "cancelled" && company.status !== "not-interested";
      const needsRestore =
        desired === "active" && company.status === "not-interested";

      if (!needsCancel && !needsRestore) {
        lastAppliedRef.current.set(projectId, desired);
        continue;
      }
      if (applied === desired && !needsCancel && !needsRestore) continue;

      lastAppliedRef.current.set(projectId, desired);
      syncFromSalesProject(project.id, project.stage);
    }
  }, [ready, projectsReady, projects, companies, syncFromSalesProject]);

  return null;
}

/** Create or reuse a Cold Lead Sales Project for an engaged prospect. */
export function useLinkProspectToColdLead() {
  const { projects, addProject, addContact, waitForProjectInsert } =
    useProjects();
  const { markPromoted, contacts } = useProspecting();

  return async function linkProspectToColdLead(
    company: ProspectCompany,
    companyContacts?: ProspectContact[],
  ): Promise<string> {
    if (company.promotedProjectId) {
      const existing = projects.find((p) => p.id === company.promotedProjectId);
      if (existing) {
        markPromoted(company.id, existing.id, {
          prospectStatus:
            company.status === "qualified" || company.status === "promoted"
              ? company.status
              : "engaged",
        });
        return existing.id;
      }
    }

    const match = projects.find(
      (p) =>
        !p.isWarehouseHolding &&
        p.stage !== "cancelled" &&
        p.client.trim().toLowerCase() === company.name.trim().toLowerCase(),
    );
    if (match) {
      markPromoted(company.id, match.id, {
        prospectStatus:
          company.status === "qualified" ? "qualified" : "engaged",
      });
      return match.id;
    }

    const people =
      companyContacts ?? contacts.filter((c) => c.companyId === company.id);

    const description = [
      company.strategyWhy && `Why: ${company.strategyWhy}`,
      company.qualification.painPoint &&
        `Pain: ${company.qualification.painPoint}`,
      company.qualification.identifiedProject &&
        `Project: ${company.qualification.identifiedProject}`,
      "Created from Prospecting (engaged → Cold Lead).",
    ]
      .filter(Boolean)
      .join("\n");

    const projectId = addProject({
      name: company.siteName
        ? `${company.name} — ${company.siteName}`
        : `${company.name} opportunity`,
      client: company.name,
      country: company.country || "—",
      city: company.city,
      series: PROSPECT_TO_PROJECT_SERIES[company.product],
      market: PROSPECT_TO_PROJECT_MARKET[company.market],
      sizeKw: 0,
      stage: "cold-lead",
      baseDescription: description,
      leadUserId: company.ownerId || undefined,
    });

    const projectOk = await waitForProjectInsert(projectId);
    if (!projectOk) {
      console.error(
        "Cold lead project insert failed; contacts/link not persisted",
        projectId,
      );
      return projectId;
    }

    for (const c of people) {
      addContact(projectId, {
        name: c.name,
        email: c.email || undefined,
        phone: c.phone || undefined,
        position: c.title || undefined,
      });
    }

    markPromoted(company.id, projectId, { prospectStatus: "engaged" });
    return projectId;
  };
}
