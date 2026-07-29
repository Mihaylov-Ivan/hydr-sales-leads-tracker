import { Project, DEFAULT_EMAIL_REMINDER_DAYS, emptyFinancials } from "./types";

function daysAgo(n: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function dateAgo(n: number): string {
  return daysAgo(n).slice(0, 10);
}

export const SEED_PROJECTS: Project[] = [
  {
    id: "p-sofia-district",
    name: "Sofia District Heating H2 Blend",
    client: "Toplofikacia Sofia",
    country: "Bulgaria",
    city: "Sofia",
    series: "Z Series",
    market: "Power Plants",
    sizeKw: 1000,
    stage: "under-development",
    baseDescription:
      "Green hydrogen production for blending into the district heating gas supply, targeting a 10% H2 blend in the first phase.",
    createdAt: daysAgo(120),
    lastClientContactAt: dateAgo(4),
    emailReminderDays: DEFAULT_EMAIL_REMINDER_DAYS,
    todos: [],
    contacts: [
      {
        id: "ct1",
        name: "Ivan Petrov",
        position: "Head of Engineering",
        email: "i.petrov@toplo-sofia.bg",
        phone: "+359 88 123 4567",
        createdAt: daysAgo(120),
      },
    ],
    financials: emptyFinancials(),
    comments: [
      {
        id: "c1",
        author: "You",
        text: "Site survey completed. Grid connection point confirmed at the Iztok substation, water supply adequate.",
        createdAt: daysAgo(60),
      },
      {
        id: "c2",
        author: "You",
        text: "Contract signed for phase 1. Moving to engineering design.",
        createdAt: daysAgo(35),
        stageChange: "under-development",
      },
      {
        id: "c3",
        author: "You",
        text: "P&ID review meeting held with client engineers. Minor changes requested to the drying skid layout, revised drawings due next week.",
        createdAt: daysAgo(4),
      },
    ],
  },
  {
    id: "p-warsaw-glass",
    name: "Warsaw Glassworks Oxy-Fuel Boost",
    client: "Vitro-Pol S.A.",
    country: "Poland",
    city: "Warsaw",
    series: "E Series",
    market: "Burner Optimisation",
    sizeKw: 250,
    stage: "new-lead",
    baseDescription:
      "E Series system to feed hydrogen and oxygen into the glass furnace combustion process to cut natural gas consumption.",
    createdAt: daysAgo(14),
    lastClientContactAt: dateAgo(12),
    emailReminderDays: DEFAULT_EMAIL_REMINDER_DAYS,
    todos: [],
    contacts: [],
    financials: emptyFinancials(),
    comments: [
      {
        id: "c1",
        author: "You",
        text: "Intro call via NABLA (Poland integrator). Client wants a feasibility estimate on fuel savings before committing to a site visit.",
        createdAt: daysAgo(12),
      },
    ],
  },
  {
    id: "p-munich-fleet",
    name: "Munich Bus Fleet Refuelling",
    client: "Stadtwerke München",
    country: "Germany",
    city: "Munich",
    series: "Z Series",
    market: "Clean H2",
    sizeKw: 2000,
    stage: "new-lead",
    baseDescription:
      "Hydrogen production and compression for a municipal bus refuelling station, initial fleet of 12 fuel-cell buses.",
    createdAt: daysAgo(21),
    lastClientContactAt: dateAgo(6),
    emailReminderDays: DEFAULT_EMAIL_REMINDER_DAYS,
    todos: [],
    contacts: [],
    financials: emptyFinancials(),
    comments: [
      {
        id: "c1",
        author: "You",
        text: "Hydro Future GmbH forwarded the tender documents. Deadline for the technical proposal is end of next month.",
        createdAt: daysAgo(18),
      },
      {
        id: "c2",
        author: "You",
        text: "Sent preliminary sizing: 2 MW Z Series with 350 bar compression and 400 kg/day output. Awaiting client feedback.",
        createdAt: daysAgo(6),
      },
    ],
  },
  {
    id: "p-istanbul-steel",
    name: "Istanbul Steel Annealing Line",
    client: "Marmara Çelik",
    country: "Turkey",
    city: "Istanbul",
    series: "Custom",
    market: "Clean H2",
    sizeKw: 500,
    stage: "commissioned",
    baseDescription:
      "On-site hydrogen generation replacing trucked-in cylinders for the bright annealing line, with metal hydride buffer storage.",
    createdAt: daysAgo(300),
    lastClientContactAt: dateAgo(10),
    emailReminderDays: 14,
    todos: [],
    contacts: [],
    financials: emptyFinancials(),
    comments: [
      {
        id: "c1",
        author: "You",
        text: "FAT passed with client representatives present.",
        createdAt: daysAgo(90),
      },
      {
        id: "c2",
        author: "You",
        text: "Commissioning completed, system handed over. Purity verified at 99.999% after the dryer.",
        createdAt: daysAgo(45),
        stageChange: "commissioned",
      },
      {
        id: "c3",
        author: "You",
        text: "First monthly service visit done. Client happy, discussing an option for a second unit at their Izmir plant.",
        createdAt: daysAgo(10),
      },
    ],
  },
  {
    id: "p-plovdiv-greenhouse",
    name: "Plovdiv Greenhouse CHP",
    client: "AgroTherm EOOD",
    country: "Bulgaria",
    city: "Plovdiv",
    series: "E Series",
    market: "Burner Optimisation",
    sizeKw: 100,
    stage: "new-lead",
    baseDescription:
      "Small E Series unit to enrich the CHP combustion for a tomato greenhouse complex, improving burner efficiency and CO2 dosing.",
    createdAt: daysAgo(7),
    lastClientContactAt: dateAgo(7),
    emailReminderDays: 3,
    todos: [],
    contacts: [],
    financials: emptyFinancials(),
    comments: [],
  },
];
