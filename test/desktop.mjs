import { chromium } from "playwright-core";
import { testVaultImports } from "./vault-imports.mjs";

testVaultImports(chromium, true);
