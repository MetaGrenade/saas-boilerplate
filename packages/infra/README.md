# Infrastructure workspace

This workspace is ready for infrastructure-as-code (IaC) experimentation. It includes CDK for Terraform (CDKTF) as a default dependency so you can describe cloud resources using TypeScript. Replace the sample `src/index.ts` file with stacks that provision the services your SaaS needs.

## Getting started

```bash
pnpm --filter infra install
pnpm --filter infra lint
```

Add your preferred IaC tooling or Terraform providers as needed.
