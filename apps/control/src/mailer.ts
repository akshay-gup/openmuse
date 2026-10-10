export interface InviteMail {
  to: string;
  workspaceName: string;
  inviterName: string;
  link: string;
}

/** How an invitation reaches an email address. The people it is for need the link, not a server. */
export interface Mailer {
  sendInvite(mail: InviteMail): Promise<void>;
}

/** Prints the invitation, for a laptop. A deployment replaces it with one that sends mail. */
export const consoleMailer: Mailer = {
  async sendInvite(mail) {
    console.log(
      `[Hive control] ${mail.inviterName} invited ${mail.to} to ${mail.workspaceName}: ${mail.link}`,
    );
  },
};
