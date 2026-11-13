/** Only the missing migration is recoverable; other database failures must still reach the error boundary. */
export const licenceMigrationMissing = (error: { code: string; message: string } | null) =>
  Boolean(error && ["42P01", "PGRST205", "PGRST200"].includes(error.code) && error.message.includes("site_licence_requests"));
