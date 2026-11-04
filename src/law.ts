// Sections of the Act respecting the protection of personal information in the
// private sector (CQLR c. P-39.1), as amended by Law 25 (2021, c. 25).
// Summaries are paraphrased; the official text is the only authority.
// Checked against the consolidated text "à jour au 15 octobre 2026".

export const ACT_URL = "https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1";
export const CAI_PIA_GUIDE_URL = "https://www.cai.gouv.qc.ca/uploads/pdfs/CAI_GU_EFVP.pdf";

export interface Section {
  id: string;
  label: string;
  summary: string;
}

export const SECTIONS = {
  s3_3: {
    id: "s3_3",
    label: "s. 3.3",
    summary:
      "A privacy impact assessment is required for any project to acquire, develop or overhaul an information system or electronic service delivery system involving personal information. The assessment must be proportionate to the sensitivity, purposes, quantity, distribution and medium of the information.",
  },
  s8: {
    id: "s8",
    label: "s. 8",
    summary:
      "When collecting personal information, inform the person of the purposes and means of collection, their rights, and, if applicable, the third persons (or categories) it is communicated to and the possibility that it could be communicated outside Québec, in clear and simple language.",
  },
  s8_1: {
    id: "s8_1",
    label: "s. 8.1",
    summary:
      "Before collecting personal information with technology that can identify, locate or profile the person, first inform them of the use of that technology and of the means available to activate those functions.",
  },
  s8_2: {
    id: "s8_2",
    label: "s. 8.2",
    summary:
      "An enterprise that collects personal information through technological means must publish a confidentiality (privacy) policy on its website in clear and simple language.",
  },
  s10: {
    id: "s10",
    label: "s. 10",
    summary:
      "Take security measures to protect personal information that are reasonable given its sensitivity, purposes, quantity, distribution and medium.",
  },
  s17: {
    id: "s17",
    label: "s. 17",
    summary:
      "Before communicating personal information outside Québec, conduct a privacy impact assessment that takes into account (1) the sensitivity of the information, (2) the purposes, (3) the protection measures, including contractual ones, and (4) the legal framework of the destination State. The information may be communicated only if it would receive adequate protection, and the communication must be the subject of a written agreement. This also applies when someone outside Québec collects, uses, communicates or keeps the information on the enterprise's behalf.",
  },
  s18_3: {
    id: "s18_3",
    label: "s. 18.3",
    summary:
      "Personal information may be given to a service provider without consent when necessary for a mandate or contract, but the mandate must be in writing and specify the measures the provider must take to protect confidentiality, use the information only for the mandate, and not keep it after the mandate ends. The provider must report any violation or attempted violation without delay and allow verification.",
  },
} as const satisfies Record<string, Section>;

export type SectionId = keyof typeof SECTIONS;

export const DISCLAIMER =
  "This report is informational and is not legal advice. It records what a website sent to other organizations during an automated visit; it cannot see what happens to the data afterwards, where it is processed, or what your contracts say. Have the results reviewed by the person in charge of the protection of personal information in your organization and, where needed, a lawyer.";

// "Outside Québec" includes the other Canadian provinces and territories.
export const OUTSIDE_QUEBEC_NOTE =
  "Under s. 17, \"outside Québec\" includes other Canadian provinces and territories, not only other countries.";
