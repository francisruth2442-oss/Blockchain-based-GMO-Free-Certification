import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_FARM_ID = 101;
const ERR_INVALID_PRODUCT_ID = 102;
const ERR_INVALID_TEST_ID = 103;
const ERR_TEST_NOT_APPROVED = 104;
const ERR_CERT_ALREADY_EXISTS = 105;
const ERR_CERT_NOT_FOUND = 106;
const ERR_INVALID_STATUS = 107;
const ERR_AUDITOR_NOT_VERIFIED = 109;
const ERR_INVALID_METADATA = 110;

interface Certification {
  farmId: number;
  productId: number;
  testId: number;
  status: string;
  issueTime: number;
  metadata: string;
}

interface CertAudit {
  auditor: string;
  auditTime: number;
  notes: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class CertificationIssuerMock {
  state: {
    certCounter: number;
    authorityContract: string | null;
    certifications: Map<number, Certification>;
    certAudits: Map<number, CertAudit>;
  } = {
    certCounter: 0,
    authorityContract: null,
    certifications: new Map(),
    certAudits: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  auditors: Set<string> = new Set(["ST1TEST"]);
  events: Array<{ event: string; certId?: number }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      certCounter: 0,
      authorityContract: null,
      certifications: new Map(),
      certAudits: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.auditors = new Set(["ST1TEST"]);
    this.events = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.state.authorityContract !== null) return { ok: false, value: false };
    if (contractPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  issueCertification(farmId: number, productId: number, testId: number, metadata: string): Result<number> {
    if (!this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (farmId <= 0) return { ok: false, value: ERR_INVALID_FARM_ID };
    if (productId <= 0) return { ok: false, value: ERR_INVALID_PRODUCT_ID };
    if (testId <= 0) return { ok: false, value: ERR_INVALID_TEST_ID };
    if (metadata.length > 500) return { ok: false, value: ERR_INVALID_METADATA };
    const certId = this.state.certCounter + 1;
    if (this.state.certifications.has(certId)) return { ok: false, value: ERR_CERT_ALREADY_EXISTS };
    this.state.certifications.set(certId, {
      farmId,
      productId,
      testId,
      status: "pending",
      issueTime: this.blockHeight,
      metadata,
    });
    this.state.certCounter = certId;
    this.events.push({ event: "cert-issued", certId });
    return { ok: true, value: certId };
  }

  approveCertification(certId: number, notes: string): Result<boolean> {
    const cert = this.state.certifications.get(certId);
    if (!cert) return { ok: false, value: false };
    if (!this.auditors.has(this.caller)) return { ok: false, value: ERR_AUDITOR_NOT_VERIFIED };
    if (cert.status !== "pending") return { ok: false, value: ERR_INVALID_STATUS };
    this.state.certifications.set(certId, { ...cert, status: "active", issueTime: this.blockHeight });
    this.state.certAudits.set(certId, { auditor: this.caller, auditTime: this.blockHeight, notes });
    this.events.push({ event: "cert-approved", certId });
    return { ok: true, value: true };
  }

  revokeCertification(certId: number, notes: string): Result<boolean> {
    const cert = this.state.certifications.get(certId);
    if (!cert) return { ok: false, value: false };
    if (!this.auditors.has(this.caller)) return { ok: false, value: ERR_AUDITOR_NOT_VERIFIED };
    if (cert.status !== "active") return { ok: false, value: ERR_INVALID_STATUS };
    this.state.certifications.set(certId, { ...cert, status: "revoked", issueTime: this.blockHeight });
    this.state.certAudits.set(certId, { auditor: this.caller, auditTime: this.blockHeight, notes });
    this.events.push({ event: "cert-revoked", certId });
    return { ok: true, value: true };
  }

  getCertification(certId: number): Certification | null {
    return this.state.certifications.get(certId) || null;
  }

  getCertAudit(certId: number): CertAudit | null {
    return this.state.certAudits.get(certId) || null;
  }

  getCertCounter(): Result<number> {
    return { ok: true, value: this.state.certCounter };
  }
}

describe("CertificationIssuer", () => {
  let contract: CertificationIssuerMock;

  beforeEach(() => {
    contract = new CertificationIssuerMock();
    contract.reset();
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("issues certification successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.issueCertification(1, 1, 1, "GMO-free corn batch");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const cert = contract.getCertification(1);
    expect(cert?.farmId).toBe(1);
    expect(cert?.productId).toBe(1);
    expect(cert?.testId).toBe(1);
    expect(cert?.status).toBe("pending");
    expect(cert?.metadata).toBe("GMO-free corn batch");
    expect(contract.events).toContainEqual({ event: "cert-issued", certId: 1 });
  });

  it("rejects certification without authority contract", () => {
    const result = contract.issueCertification(1, 1, 1, "GMO-free corn batch");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects invalid farm ID", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.issueCertification(0, 1, 1, "GMO-free corn batch");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_FARM_ID);
  });

  it("rejects invalid product ID", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.issueCertification(1, 0, 1, "GMO-free corn batch");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRODUCT_ID);
  });

  it("rejects invalid test ID", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.issueCertification(1, 1, 0, "GMO-free corn batch");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TEST_ID);
  });

  it("rejects invalid metadata", () => {
    contract.setAuthorityContract("ST2TEST");
    const longMetadata = "x".repeat(501);
    const result = contract.issueCertification(1, 1, 1, longMetadata);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_METADATA);
  });

  it("approves certification successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.issueCertification(1, 1, 1, "GMO-free corn batch");
    const result = contract.approveCertification(1, "Approved after lab review");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const cert = contract.getCertification(1);
    expect(cert?.status).toBe("active");
    const audit = contract.getCertAudit(1);
    expect(audit?.auditor).toBe("ST1TEST");
    expect(audit?.notes).toBe("Approved after lab review");
    expect(contract.events).toContainEqual({ event: "cert-approved", certId: 1 });
  });

  it("rejects approval by non-auditor", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.issueCertification(1, 1, 1, "GMO-free corn batch");
    contract.auditors = new Set();
    contract.caller = "ST3FAKE";
    const result = contract.approveCertification(1, "Invalid auditor");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUDITOR_NOT_VERIFIED);
  });

  it("rejects approval for non-existent certification", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.approveCertification(99, "No cert");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects approval for non-pending certification", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.issueCertification(1, 1, 1, "GMO-free corn batch");
    contract.approveCertification(1, "Approved");
    const result = contract.approveCertification(1, "Already approved");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });

  it("revokes certification successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.issueCertification(1, 1, 1, "GMO-free corn batch");
    contract.approveCertification(1, "Approved");
    const result = contract.revokeCertification(1, "Revoked due to non-compliance");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const cert = contract.getCertification(1);
    expect(cert?.status).toBe("revoked");
    const audit = contract.getCertAudit(1);
    expect(audit?.notes).toBe("Revoked due to non-compliance");
    expect(contract.events).toContainEqual({ event: "cert-revoked", certId: 1 });
  });

  it("rejects revocation for non-existent certification", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.revokeCertification(99, "No cert");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects revocation for non-active certification", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.issueCertification(1, 1, 1, "GMO-free corn batch");
    const result = contract.revokeCertification(1, "Not active");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });

  it("returns correct certification count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.issueCertification(1, 1, 1, "GMO-free corn batch");
    contract.issueCertification(2, 2, 2, "GMO-free wheat batch");
    const result = contract.getCertCounter();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("parses certification parameters with Clarity types", () => {
    const metadata = stringUtf8CV("GMO-free corn batch");
    const farmId = uintCV(1);
    const productId = uintCV(1);
    const testId = uintCV(1);
    expect(metadata.value).toBe("GMO-free corn batch");
    expect(farmId.value).toEqual(BigInt(1));
    expect(productId.value).toEqual(BigInt(1));
    expect(testId.value).toEqual(BigInt(1));
  });

});