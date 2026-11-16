// Tells Convex to accept Clerk-issued JWTs. The issuer domain comes from the
// Clerk dashboard (JWT template named "convex"), set on the Convex deployment:
//   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-clerk>.clerk.accounts.dev
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
