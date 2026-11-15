/* WaterBreak configuration. */
window.WB_CONFIG = {
  // OAuth 2.0 "Web application" client ID from Google Cloud Console
  // (Authorized JavaScript origin: https://enricotoso96.github.io). Empty = sign-in gate disabled.
  googleClientId: '',
  // SHA-256 of invited (lower-case) email addresses. Add people with: node tools/add-user.mjs name@gmail.com
  allowedEmailSha256: [
    '715eef56aca292347d703a5e022f09cf6e18e85e525d3971f90f66743b756be5',
    '4c4ad29babfdd8d17466181d065c8774aa7f9dc90614b0d7edda493991f1915e',
  ],
};
