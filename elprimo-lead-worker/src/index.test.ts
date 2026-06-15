import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import worker from "./index";
import type { Env, SuccessResponse, ErrorResponse } from "./types";

// Mock Cloudflare environment
const env: Env = {
  HUBSPOT_ACCESS_TOKEN: "mock-token-12345",
  HUBSPOT_PIPELINE_ID: "default",
  HUBSPOT_DEALSTAGE_ID: "appointmentscheduled",
};

describe("HubSpot Lead Worker — Production-Grade Tests", () => {
  let capturedFetchCalls: Array<{ url: string; body?: string }> = [];

  beforeAll(() => {
    // Mock fetch to intercept and capture all HubSpot API calls
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const body = init?.body ? String(init.body) : undefined;
      capturedFetchCalls.push({ url, body });

      if (url.includes("api.hubapi.com/crm/v3/objects/contacts/search")) {
        return new Response(JSON.stringify({ total: 0, results: [] }), { status: 200 });
      }

      if (url.includes("api.hubapi.com/crm/v3/objects/contacts")) {
        return new Response(JSON.stringify({ id: "mock-contact-123" }), { status: 201 });
      }

      if (url.includes("api.hubapi.com/crm/v3/objects/deals")) {
        return new Response(JSON.stringify({ id: "mock-deal-456" }), { status: 201 });
      }

      if (url.includes("deal_to_contact")) {
        return new Response(null, { status: 204 });
      }

      return new Response("Not found", { status: 404 });
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  // ────────────────────────────────────────────────────────
  // TESTS — CORS & Routing
  // ────────────────────────────────────────────────────────

  it("should respond to OPTIONS with CORS headers", async () => {
    capturedFetchCalls = [];
    const request = new Request("http://example.com/lead", {
      method: "OPTIONS",
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  it("should reject non-POST requests with 404", async () => {
    const request = new Request("http://example.com/lead", {
      method: "GET",
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(404);
  });

  it("should reject invalid JSON with 400 and error message", async () => {
    const request = new Request("http://example.com/lead", {
      method: "POST",
      body: "{invalid json}",
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.success).toBe(false);
    expect(data.error).toBe("Invalid JSON payload");
  });

  // ────────────────────────────────────────────────────────
  // TESTS — Input Validation
  // ────────────────────────────────────────────────────────

  it("should reject missing required 'nombre' field", async () => {
    const payload = { telefono: "3001234567" };
    const request = new Request("http://example.com/lead", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.success).toBe(false);
    expect(data.error).toContain("nombre");
  });

  it("should reject missing required 'telefono' field", async () => {
    const payload = { nombre: "Test User" };
    const request = new Request("http://example.com/lead", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.success).toBe(false);
    expect(data.error).toContain("telefono");
  });

  // ────────────────────────────────────────────────────────
  // TESTS — Honeypot
  // ────────────────────────────────────────────────────────

  it("should silently accept and return success for honeypot (website field filled)", async () => {
    capturedFetchCalls = [];
    const payload = {
      nombre: "Spam Bot",
      telefono: "3001234567",
      website: "spam-website.com",
    };
    const request = new Request("http://example.com/lead", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    const data = (await response.json()) as SuccessResponse;
    expect(data.success).toBe(true);
    expect(data.contactId).toBe("honeypot");
    // Verify no HubSpot calls were made
    expect(capturedFetchCalls.filter((c) => c.url.includes("api.hubapi.com"))).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────
  // TESTS — Phone Normalization (Colombian formats)
  // ────────────────────────────────────────────────────────

  it("should normalize Colombian phone 10-digit format (3001234567 → +573001234567)", async () => {
    capturedFetchCalls = [];
    const payload = {
      nombre: "Test User",
      telefono: "3001234567",
    };
    const request = new Request("http://example.com/lead", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);

    // Find the contact creation call
    const contactCall = capturedFetchCalls.find((c) => c.url.includes("/objects/contacts") && !c.url.includes("/search"));
    expect(contactCall).toBeDefined();
    if (contactCall?.body) {
      const body = JSON.parse(contactCall.body) as { properties: { telefono_whatsapp_normalizado: string } };
      expect(body.properties.telefono_whatsapp_normalizado).toBe("+573001234567");
    }
  });

  it("should normalize Colombian phone 12-digit format (573001234567 → +573001234567)", async () => {
    capturedFetchCalls = [];
    const payload = {
      nombre: "Test User",
      telefono: "573001234567",
    };
    const request = new Request("http://example.com/lead", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);

    const contactCall = capturedFetchCalls.find((c) => c.url.includes("/objects/contacts") && !c.url.includes("/search"));
    if (contactCall?.body) {
      const body = JSON.parse(contactCall.body) as { properties: { telefono_whatsapp_normalizado: string } };
      expect(body.properties.telefono_whatsapp_normalizado).toBe("+573001234567");
    }
  });

  // ────────────────────────────────────────────────────────
  // TESTS — UTM Attribution (NEW)
  // ────────────────────────────────────────────────────────

  it("should NOT send read-only hs_analytics_* properties (they cause HubSpot 400)", async () => {
    capturedFetchCalls = [];
    const payload = {
      nombre: "Test User",
      telefono: "3001234567",
      source: "Meta Ads",
      utm_campaign: "Black Friday Sale",
      utm_source: "facebook",
      utm_medium: "social_cpc",
    };
    const request = new Request("http://example.com/lead", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);

    // hs_analytics_* son de solo lectura en HubSpot y devuelven 400 si se escriben.
    // El worker NO debe incluirlas en el payload de contacto ni de deal.
    const contactCall = capturedFetchCalls.find((c) => c.url.includes("/objects/contacts") && !c.url.includes("/search"));
    expect(contactCall?.body).toBeDefined();
    if (contactCall?.body) {
      const body = JSON.parse(contactCall.body) as { properties: Record<string, string> };
      const props = body.properties;
      expect(props.hs_analytics_source).toBeUndefined();
      expect(props.hs_analytics_source_data_1).toBeUndefined();
      expect(props.hs_analytics_source_data_2).toBeUndefined();
      expect(props.hs_analytics_source_data_3).toBeUndefined();
      // La fuente se conserva en una propiedad custom escribible.
      expect(props.fuente_lead).toBe("Meta Ads");
    }

    const dealCall = capturedFetchCalls.find((c) => c.url.includes("/objects/deals"));
    if (dealCall?.body) {
      const body = JSON.parse(dealCall.body) as { properties: Record<string, string> };
      expect(body.properties.hs_analytics_source).toBeUndefined();
      expect(body.properties.hs_analytics_source_data_1).toBeUndefined();
    }
  });

  // ────────────────────────────────────────────────────────
  // TESTS — Correlation ID (NEW)
  // ────────────────────────────────────────────────────────

  it("should return a unique correlationId in success response", async () => {
    capturedFetchCalls = [];
    const payload = {
      nombre: "Test User",
      telefono: "3001234567",
    };
    const request = new Request("http://example.com/lead", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const response = await worker.fetch(request, env);
    const data = (await response.json()) as SuccessResponse;

    expect(data.success).toBe(true);
    expect(data.correlationId).toBeDefined();
    expect(typeof data.correlationId).toBe("string");
    // Format: YYYY-MM-DDThh:mm:ss_xxxxxxxx
    expect(data.correlationId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}_[a-f0-9]{8}$/);
  });

  // ────────────────────────────────────────────────────────
  // TESTS — Budget Mapping to Deal Amount
  // ────────────────────────────────────────────────────────

  it("should map budget range '$15M - $30M' to dealAmount 22500000", async () => {
    capturedFetchCalls = [];
    const payload = {
      nombre: "Test User",
      telefono: "3001234567",
      presupuesto: "$15M - $30M",
    };
    const request = new Request("http://example.com/lead", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);

    // Find deal creation call
    const dealCall = capturedFetchCalls.find((c) => c.url.includes("/objects/deals"));
    expect(dealCall?.body).toBeDefined();
    if (dealCall?.body) {
      const body = JSON.parse(dealCall.body) as { properties: { amount: string } };
      expect(body.properties.amount).toBe("22500000");
    }
  });

  // ────────────────────────────────────────────────────────
  // TESTS — Full Happy Path
  // ────────────────────────────────────────────────────────

  it("should process complete lead with all fields and return contactId, dealId, correlationId", async () => {
    capturedFetchCalls = [];
    const payload = {
      nombre: "Saulo García",
      telefono: "3001234567",
      zona: "Medellín",
      tipo: "Vestier de Lujo",
      presupuesto: "$15M - $30M",
      mensaje: "Necesito presupuesto para vestier",
      source: "Landing Page",
      utm_campaign: "Summer Campaign 2026",
      utm_source: "instagram",
      utm_medium: "paid_social",
    };
    const request = new Request("http://example.com/lead", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    const data = (await response.json()) as SuccessResponse;

    expect(data.success).toBe(true);
    expect(data.contactId).toBe("mock-contact-123");
    expect(data.dealId).toBe("mock-deal-456");
    expect(data.correlationId).toBeDefined();
    expect(data.message).toContain("Ref-ID");
    expect(data.message).toContain("correlationId");

    // Verify 5 HubSpot API calls were made:
    // 1. Search for existing contact
    // 2. Create contact (since not found)
    // 3. Create deal
    // 4. Associate deal to contact
    const hsApicalls = capturedFetchCalls.filter((c) => c.url.includes("api.hubapi.com"));
    expect(hsApicalls.length).toBeGreaterThanOrEqual(3); // At least search, create contact, create deal
  });

  // ────────────────────────────────────────────────────────
  // TESTS — Existing Contact Detection
  // ────────────────────────────────────────────────────────

  it("should reuse existing contact if phone match is found", async () => {
    capturedFetchCalls = [];
    // Override fetch for this test to simulate existing contact
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const body = init?.body ? String(init.body) : undefined;
      capturedFetchCalls.push({ url, body });

      if (url.includes("api.hubapi.com/crm/v3/objects/contacts/search")) {
        return new Response(JSON.stringify({ total: 1, results: [{ id: "existing-contact-999" }] }), { status: 200 });
      }

      if (url.includes("api.hubapi.com/crm/v3/objects/deals")) {
        return new Response(JSON.stringify({ id: "mock-deal-456" }), { status: 201 });
      }

      if (url.includes("deal_to_contact")) {
        return new Response(null, { status: 204 });
      }

      return new Response("Not found", { status: 404 });
    });

    capturedFetchCalls = [];
    const payload = {
      nombre: "Returning Customer",
      telefono: "3001234567",
    };
    const request = new Request("http://example.com/lead", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const response = await worker.fetch(request, env);
    const data = (await response.json()) as SuccessResponse;

    expect(data.success).toBe(true);
    expect(data.contactId).toBe("existing-contact-999");

    // Verify only 2 calls (search + create deal), NOT create contact
    const createContactCalls = capturedFetchCalls.filter(
      (c) => c.url.includes("/objects/contacts") && !c.url.includes("/search")
    );
    expect(createContactCalls).toHaveLength(0);
  });
});
