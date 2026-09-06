/* Pamet authenticated feature bundle.
 * Loaded after a valid Pamet session. Login, account isolation, recovery/security,
 * entitlements, store, and release handling stay eager in js/main.js.
 */
import "./home-dashboard.js";
import "./home-dashboard-lifecycle.js";
import "./plan-comparison.js";
import "./plan-management-loader.js";
import "./billing-sharing.js";
import "./observation-engine.js";
import "./log-experience.js";
import "./feedback.js";
import "./care-planning.js";
import "./care-workspace.js";
import "./notifications.js";
import "./platform-experience.js";
import "./encrypted-sync.js";
import "./qr-sharing.js";
import "./product-clarity.js";
import "./insights.js";
import "./insights-charting-loader.js";
import "./interaction-controller.js";
import "./experience.js";
import "./care-ux.js";
import "./visit-workflow-loader.js";
import "./advanced-visit-brief.js";
import "./ui-ux.js";
import "./care-sharing-enhancements.js";
import "./caregiver-pdf-fallback.js";

window.PametAuthenticatedFeaturesLoaded = true;
window.dispatchEvent(new CustomEvent("pamet:authenticated-features-ready"));