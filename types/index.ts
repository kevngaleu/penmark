export interface Resume {
  id: string
  owner_id: string | null
  slug: string
  current_pdf_url: string
  current_version: number
  is_link_open: boolean
  is_paid: boolean
  hired_at: string | null
  last_active_at: string
  created_at: string
}

export interface ResumeVersion {
  id: string
  resume_id: string
  version_number: number
  pdf_url: string
  label: string
  created_at: string
}

export interface Comment {
  id: string
  resume_id: string
  reviewer_uuid: string | null
  reviewer_name: string | null
  selected_text: string | null
  body: string
  page_number: number
  top_pct: number
  left_pct: number
  is_general: boolean
  archived_at_version: number | null
  created_at: string
}
