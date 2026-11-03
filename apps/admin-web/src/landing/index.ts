import "./landing.css";
import { getSession } from "../lib/session";
import { mountHeader, renderHeader } from "./components/header";
import { renderHero } from "./components/hero";
import { renderFeatures } from "./components/features";
import { mountShowcase, renderShowcase } from "./components/showcase";
import { renderStakeholders } from "./components/stakeholders";
import { mountCalculator, renderCalculator } from "./components/calculator";
import { renderContact } from "./components/contact";
import { mountFooter, renderFooter } from "./components/footer";

export function renderLandingPage(navigate: (path: string) => void): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;

  const isLoggedIn = Boolean(getSession());

  app.innerHTML = `
    <div class="aksis-landing" id="main-content">
      ${renderHeader(isLoggedIn)}
      <main>
        ${renderHero()}
        ${renderFeatures()}
        ${renderShowcase()}
        ${renderStakeholders()}
        ${renderCalculator(750)}
        ${renderContact()}
      </main>
      ${renderFooter()}
    </div>
  `;

  const container = app.querySelector<HTMLElement>(".aksis-landing");
  if (!container) return;

  const context = { container, navigate };

  mountHeader(context);
  mountShowcase(context);
  mountCalculator(container);
  mountFooter(context);
}
