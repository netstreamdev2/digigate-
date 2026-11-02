/** What a popup form gets back. `saved` changes on every success, which is how the popup knows to close. */
export type FormState = { problem: string | null; saved: number };

export const FORM_START: FormState = { problem: null, saved: 0 };
