export class User {
  constructor (
    public userId: number,
    public name: string,
    public username: string,
    public email: string,
    public did: string,
    public state: number,
    public stateName: string,
    public role: number,
    public roleName: string,
    public createdAt: number,
    public lastModifiedAt: number
  ){}
}

// A named, role-scoped preset of Menu Access + System Functions settings an admin
// assigns to users (live membership — group edits propagate to members).
export interface UserGroup {
  groupId: string;
  name: string;
  description: string | null;
  role: number;       // immutable target user role
  memberCount: number;
  createdAt: number | null;
  updatedAt: number | null;
}

export class Key {
  constructor (
    public address: string,
    public privateKey: string,
    public publicKey: string
  ){}
}

export class SignerKey {
  constructor (
    public id: number,
    public address: string,
    public description: string,
    public state: number,
    public stateName: string,
    public createdAt: number
  ){}
}

export class Country {
  constructor (
    public countryId: number,
    public nameShort: string,
    public nameFull: string,
    public alpha2Code: string,
    public alpha3Code: string,
    public currencyName: string,
    public currencyCode: string,
    public callingCode: number,
    public countryCode: number
  ){}
}

export class GlobalVariable {
  constructor (
    public category: string,
    public variableId: number,
    public name: string,
    public visible: boolean
  ){}
}

export class LogEvent {
  constructor (
    public eventName: string,       // ABI event name: 'ControlEvent', 'UserCreated', etc.
    public blockNumber: number,
    public transactionHash: string,
    public timestamp: number,
    public sender: string,          // primary address (caller / sender / account)
    public target: string,          // secondary identifier (address1 / destination / userId)
    public action: string,          // action string or derived description
    public role: string = '',       // ControlEvent: role name
    public roleHash: string = '',   // ControlEvent: role hash
    public actionHash: string = ''  // ControlEvent: action hash
  ) {}
}

export interface StateChangeLog {
  id: number;
  address: string;
  type: string;
  action: string;
  new_value: string;
  reason: string;
  caller: string;
  tx_hash: string;
  block_number: number;
  user_id: number | null;
  user_name: string;
  client_ip: string;
  created_at: number;
}

// Slim, privacy-first audit-log shape. Mirrors the on-chain AuditLog event:
// no target / subject / state / reason / visibility / encrypted payload.
// `client_ip` and `actor_user_address` are full off-chain values (from the
// API's tenant DB) — render them masked in the UI via utils.maskIp / shortAddr.
export class AuditLog {
  constructor(
    public id: number,
    public category: string,
    public action: string,
    public actor_address: string,
    public actor_user_id: string | null,
    public actor_user_address: string | null,
    public country_code: number,
    public function_selector: string | null,
    public contract: string | null,
    public ref_no: string,
    public tx_hash: string,
    public block_number: number,
    public log_index: number,
    public chain_time: number,
    public client_ip: string | null,
    public created_at: number,
    public actor_name: string | null = null,
    public actor_kind: string | null = null,
    public actor_user_name: string | null = null,
    public function_name: string | null = null,
    public function_signature: string | null = null,
    public contract_name: string | null = null,
    public contract_kind: string | null = null,
    public action_label: string | null = null,
    public prev_hash: string | null = null,
    public row_hash: string | null = null,
    public verified: boolean | null = null,
    // canonical display timestamp (ms), computed API-side (chain_time→ms else created_at)
    public time: number = 0
  ) {}

  get categoryLabel(): string {
    return (this.category || '').replace(/_/g, ' ');
  }

  get actionLabel(): string {
    // Persisted drain-time readable label ("Credit – Service Deposit");
    // falls back to the raw decoded action for legacy rows.
    return this.action_label || (this.action || '').replace(/_/g, ' ');
  }
}

export interface ActivityLog {
  id: number;
  category: string;
  action: string;
  target: string;
  details: string;
  user_id: number | null;
  user_name: string;
  client_ip: string;
  created_at: number;
  time?: number; // canonical display timestamp (ms), computed API-side
}


// export class Asset {
//   constructor (
//     public address: string,
//     public name: string,
//     public symbol: string,
//     public issuer: string,
//     public manager: string,
//     public regulator: string,
//     public tokenType: number,
//     public tokenTypeName: string,
//     public assetType: number,
//     public assetTypeName: string,
//     public data: string,
//     public totalSupply: number,
//     public circulating: number,
//     public currencyCode: number,
//     public createdOn: number,
//     public state: number,
//     public stateName: string
//   ){}
// }

// export class AssetHolder {
//   constructor (
//     public address: string,
//     public balance: number
//   ) {}
// }

// export class AssetSupplyChange {
//   constructor (
//     public changeType: number,
//     public changeTypeName: string,
//     public amount: number,
//     public timestamp: number
//   ) {}
// }

// export class AssetPrice {
//   constructor (
//     public bid: number,
//     public ask: number,
//     public timestamp: number
//   ) {}
// }

export class Operator {
  constructor (
    public operator: string,
    public name: string,
    public symbol: string,
    public data: string,
    public email: string,
    public mobile: string,
    public countryCode: number,
    public countryName: string,
    public state: boolean,
    public stateName: string
  ) {}
}

export class Validator {
  constructor (
    public address: string,
    public name: string,
    public data: string,
    public email: string,
    public mobile: string,
    public countryCode: number,
    public countryName: string,
    public regulator: string,
    public regulatorName: string,
    public regulatorSymbol: string,
    public state: number,
    public stateName: string
  ) {}
}

// Entity-curated service provider — the admin-managed subset of the regulator's
// authorised SPs that the entity's services may select from.
export class EntityServiceProvider {
  constructor (
    public address: string,
    public spType: number,        // 1=Validator, 2=PaymentProcessor, 3=Custodian
    public spTypeName: string,
    public name: string,
    public level: number,
    public regulator: string,
    public state: number,         // 1=Active, 2=Suspended
    public stateName: string,
    public updatedAt: number
  ) {}
}

export interface ContactInfo {
  email: string;
  phone: string;
  website: string;
  address: string;
}

export class Entity {
  constructor (
    public address: string,
    public name: string,
    public metadata: string,
    public email: string,
    public mobile: string,
    public website: string,
    public countryCode: number,
    public countryName: string,
    public regulator: string,
    public regulatorName: string,
    public regulatorSymbol: string,
    public state: number,
    public stateName: string,
    // Public-profile fields (2026-07-20) — nested contact + description live inside the
    // metadata JSON and are spread onto the entity object by the API's getEntity().
    public description: string = '',
    public contact?: ContactInfo,
  ) {}
}

export class Service {
  constructor (
    public address: string,
    public entity: string,
    public entityName: string,
    public name: string,
    public metadata: string,
    public description: string,
    public email: string,
    public mobile: string,
    public website: string,
    public countryCode: number,
    public countryName: string,
    public verificationLevel: number,
    public verificationLevelName: string,
    public serviceType: number,
    public serviceTypeName: string,
    public regulator: string,
    public regulatorName: string,
    public regulatorSymbol: string,
    public validator: string,
    public paymentProcessor: string,
    public suspended: boolean,
    public state: number,
    public stateName: string,
    public validatorActive: boolean = true,
    public visibility: number = 1,
    public custodian: string = '',
    public custodianActive: boolean = true,
    // Entity-declared sub-type for service providers (serviceType 2): 1=Validator,
    // 2=PaymentProcessor, 3=Custodian, 4=DataProvider; 0 for token issuers.
    public providerType: number = 0,
    public providerTypeName: string = '',
    // Nested public contact info (2026-07-20) — derived from the service metadata's `contact`
    // key with fallback to the legacy flat email/mobile/website.
    public contact?: ContactInfo
  ) {}
}

export class PaymentProcessor {
  constructor (
    public address: string,
    public serviceLevel: number,
    public state: number,
    public regulator: string,
    public countryCode: number
  ) {}
}

export class Identity {
  constructor (
    public address: string,
    public ginHash: string,
    public metadata: string,
    public countryCode: number,
    public countryName: string,
    public createdAt: number,
    public createdBy: string,
    public createdByName: string,
    public lastVarifiedAt: number,
    public lastVarifiedBy: string,
    public lastVarifiedByName: string
  ) {}
}

export class Subscription {
  constructor (
    public subscription: string,
    public entity: string,
    public entityName: string,
    public service: string,
    public serviceName: string,
    public validator: string,
    public validatorName: string,
    public validatorVerificationId: number,
    public validatorTimestamp: number,
    public regulator: string,
    public regulatorName: string,
    public createdAt: number,
    public suspended: boolean,
    public state: number,
    public stateName: string,
    public validatorActive: boolean = true,
    public holdingsByCurrency: { currency: string; currencyName: string; value: number }[] = [],
    public holdingsTotalValue: number = 0,
  ) {}
}

export class ValidatorIdentity {
  constructor (
    public identity: string,
    public operator: string,
    public data: string,
    public validatedAt: number
  ) {}
}

export class AssetService {
  constructor (
    public service: string,
    public serviceName: string,
    public state: number = 0,
    public stateName: string = '',
    public canQuote: boolean = false,
    // Distributor consent (accept-then-activate, D4): regulator activation to state 2
    // requires the distributor service's own acceptDistribution() on-chain.
    public distributionAccepted: boolean = false,
    // Derived server-side: false when this service belongs to the asset's own issuer
    // entity — not a distributor, exempt on-chain, activated directly by the regulator.
    // Defaults true so an older API build keeps the previous rendering.
    public consentRequired: boolean = true
  ) {}
}

// Uniform D7b fee engine (2026-08-03): per-direction pair, each side
// { mode: 0 None / 1 Bps (1-2000) / 2 Fixed (wei), value, bearing: 0 OnTop / 1 Deducted }.
// The destination is forced on-chain to the configuring service's own account.
export interface FeeConfig {
  buyFeeMode: number;
  buyFeeValue: string;
  buyFeeDestination: string;
  buyFeeBearing: number;
  sellFeeMode: number;
  sellFeeValue: string;
  sellFeeDestination: string;
  sellFeeBearing: number;
}

// ─── Settlements (fiat obligations / net positions, issuer/DEX model) ───────────

// Net position with one counterparty in one currency, from THIS entity's perspective:
// netOwedBySelf > 0 ⇒ we owe the counterparty; < 0 ⇒ they owe us.
export interface CreditPosition {
  counterparty: string;
  counterpartyName?: string;
  currencyCode: number;
  currencyName?: string;
  netOwedBySelf: number;
  blockNumber: number;
  updatedAt: number;
}

// One per-transaction obligation row (kind: 1 Derived / 2 Declared / 3 Claimed).
export interface CreditObligation {
  debtorEntity: string;
  creditorEntity: string;
  obligationId: number;
  currencyCode: number;
  amount: number;
  creditTrxId: number;
  kind: number;
  origin: number;
  state: number;
  ref: string;
  blockNumber: number;
  createdAt: number;
}

// Settlement lifecycle: 1 Pending → 2 SentConfirmed → 3 Settled; 4 Cancelled.
export interface CreditSettlement {
  debtorEntity: string;
  creditorEntity: string;
  settlementId: number;
  currencyCode: number;
  amount: number;
  state: number;
  createdBy: string;
  sentConfirmedBy: string | null;
  receivedConfirmedBy: string | null;
  wireRef: string | null;
  receiptCid: string | null;
  createdAt: number;
  updatedAt: number;
}

// Inbound distribution agreement: an (asset, my service) registration with its
// activation state + this side's consent flag.
export interface DistributionAgreement {
  asset: string;
  assetName: string | null;
  assetSymbol: string | null;
  issuer: string | null;
  issuerService: string | null;
  service: string;
  serviceName: string | null;
  state: number;
  distributionAccepted: boolean;
  // Derived: false for a service of the asset's own issuer entity (not a distributor).
  consentRequired: boolean;
}

// Primary-market trade (announced PrimarySubscribed / PrimaryRedeemed mesh rows).
export interface PrimaryTrade {
  creditTrxId: number;
  direction: number;           // 1 = subscribe (buy), 2 = redeem (sell)
  asset: string;
  subscription: string;
  distributorService: string;
  issuerService: string;
  certificates: number;
  price: number;
  gross: number;
  fee: number;
  feeBearing: number;          // 0 = OnTop, 1 = Deducted
  obligationId: number;
  assetTrxId: number;
  txHash: string;
  blockNumber: number;
  createdAt: number;
}

// DEX offering (primary issuance on a venue — IPO facility). kind 2 = Tap;
// status: 1 Pending, 2 Approved (live), 6 Completed, 7 Cancelled, 8 Rejected.
export interface DexOffering {
  offeringKey: string;
  seq: number;
  baseAsset: string;
  dexService: string;
  issuerService: string;
  kind: number;
  status: number;
  suspended: boolean;
  suspendedReason: string | null;
  price: number;
  amount: number;
  sold: number;
  currencyCode: number;
  buyFeeBps: number;
  buyFeeBearing: number;
  sellFeeBps: number;
  sellFeeBearing: number;
  minFill: number;
  maxPerSubscription: number;
  createdAt: number;
  updatedAt: number;
}

export interface DexOfferingFill {
  fillId: number;
  subscription: string;
  amount: number;
  price: number;
  gross: number;
  venueFee: number;
  netToIssuer: number;
  withholdTrxId: number;
  assetTrxId: number;
  createdAt: number;
}

// ─── DEX negotiated OTC deals (2026-08-07) ──────────────────────────────────
// A deal is TARGETED and NAMED, unlike a book order: proposed to one counterparty,
// counter-able by either side, accepted by one, then approved by the VENUE OPERATOR
// before it crosses.
//
// `side` is the PROPOSER's and NEVER changes (1 = the proposer buys the base asset,
// 2 = sells it) — do not read it as "this deal is a buy". `buyer` / `seller` are
// derived server-side precisely so no surface re-derives them and gets one backwards.
export interface DexDeal {
  dealKey: string;
  seq: number;
  dexService: string;
  dexServiceName: string;
  venueEntity?: string;
  venueEntityName?: string;
  proposer: string;
  proposerEntity?: string;
  proposerEntityName?: string;
  proposerServiceName?: string;
  counterparty: string;
  counterpartyEntity?: string;
  counterpartyEntityName?: string;
  counterpartyServiceName?: string;
  baseAsset: string;
  assetName: string;
  assetSymbol: string;
  side: number;            // 1 = proposer BUYS, 2 = proposer SELLS
  funding: number;         // 1 = Firm, 2 = Indicative
  marketScope: number;
  status: number;          // 1 Proposed 2 Accepted 3 Settled 4 Rejected 5 Withdrawn 6 VenueRejected 7 Expired
  lastMover: number;       // 1 = proposer, 2 = counterparty — whose quote is LIVE
  suspended: boolean;      // regulator intervention, ORTHOGONAL to status
  suspendedReason: string;
  decisionReason: string;
  round: number;
  price: number;
  amount: number;
  currencyCode: number;
  currencyName: string;
  countryCode: number;
  countryName: string;
  buyFrozenFee: number;
  sellFrozenFee: number;
  buyFeeBearing: number;   // 0 = OnTop, 1 = Deducted
  sellFeeBearing: number;
  creditWithheld: number;
  creditTrxId: number;
  assetWithheld: number;
  expiresAt: number;       // ONE clock: quote validity AND the venue-approval deadline
  requestKey: string;      // RFQ parent, '' when standalone
  buyOrderId: number;
  sellOrderId: number;
  tradeId: number;
  createdAt: number;
  updatedAt: number;
  buyer: string;
  seller: string;
  isTerminal: boolean;
}

// One row per observed deal event — the negotiation trail. Keyed by log identity
// server-side, so several rows may share a `roundNo`. Money/token fields are NULL on
// the actions that set no terms; that is distinct from zero.
export interface DexDealRound {
  txHash: string;
  logIndex: number;
  roundNo: number;
  action: number;          // 1 Propose 2 Counter 3 Accept 4 Reject 5 Withdraw 6 VenueApprove
                           // 7 VenueReject 8 Expire 9 Suspend 10 Unsuspend 11 Funded 12 Released 13 Settled
  actor: string;
  price: number | null;
  amount: number | null;
  buyFrozenFee: number | null;
  sellFrozenFee: number | null;
  oldStatus: number | null;
  newStatus: number | null;
  reason: string;
  blockNumber: number | null;
  createdAt: number;
}

export interface DexDealCounterparty {
  subscription: string;
  entityAddress: string;
  entityName: string;
  serviceName: string;
  dealCount: number;
  lastDealtAt: number;
}

// ─── DEX RFQ (2026-08-08) ───────────────────────────────────────────────────
// An RFQ is a FAN-OUT OVER DEALS. A dealer's answer IS a DexDeal, so a quote's
// terms are read through vaultDexDealsList({ request }) — there is no quote model
// and no quote endpoint. This carries the request header only.
//
// `side` is the REQUESTER's; every quote takes the opposite one. `amount` is FIXED
// and `funding` is IMPOSED on every quote, which is what makes the answers
// comparable and the award well-defined.
export interface DexRfqRequest {
  requestKey: string;
  seq: number;
  dexService: string;
  dexServiceName: string;
  venueEntity?: string;
  venueEntityName?: string;
  requester: string;
  requesterEntity?: string;
  requesterEntityName?: string;
  requesterServiceName?: string;
  baseAsset: string;
  assetName: string;
  assetSymbol: string;
  side: number;            // 1 = requester BUYS, 2 = requester SELLS
  marketScope: number;
  status: number;          // 1 Open 2 Awarded 3 Cancelled 4 Expired
  funding: number;         // 1 = Firm, 2 = Indicative — imposed on every quote
  suspended: boolean;      // regulator intervention, ORTHOGONAL to status
  suspendedReason: string;
  openToAll: boolean;
  amount: number;          // plain token count, FIXED
  currencyCode: number;
  currencyName: string;
  countryCode: number;
  countryName: string;
  expiresAt: number;       // ONE clock, inherited verbatim by every child quote
  invitedCount: number;
  quoteCount: number;
  awardedDeal: string;
  createdAt: number;
  updatedAt: number;
  isOpen: boolean;
}

// Where one dealer stands on a request.
//
// ⚠️ Won / Lost / Passed have NO on-chain counterpart — a losing quote dies by
// predicate and nothing ever marks it, so these states are the sync plugin's
// inference. And the board is a SEALED AUCTION: the full dealer set is mirrored
// only for the venue operator and the requester, so a single row means "all we may
// see", never "all there was". Read totals off the request header instead.
export interface DexRfqDealer {
  dealer: string;
  dealerEntity?: string;
  dealerEntityName?: string;
  dealerServiceName?: string;
  state: number;                 // 1 Invited 2 Quoted 3 Won 4 Lost 5 Passed
  dealKey: string;               // '' until they answer
  invitedAt: number | null;      // null when they quoted an openToAll request uninvited
  quotedAt: number | null;
  updatedAt: number;
  quotePrice: number | null;
  quoteStatus: number | null;
  quoteRound: number | null;
}

// External API integration row (admin settings; pure-config records — the former eKYC
// adapter binding / service links are gone) — param VALUES never reach the frontend;
// each key only carries `set` + `secret` flags.
export interface IntegrationParam {
  key: string;
  secret: boolean;
  set: boolean;
}

export interface ExternalIntegration {
  name: string;
  displayName: string;
  category: string;
  enabled: boolean;
  isDefault: boolean;
  updatedAt: number | null;
  params: IntegrationParam[];
}

// Runtime app configuration (DB-backed override of the .env/registry seed). Server returns
// camelCase already — no snake_case mapping needed. Non-secret keys carry `value`; secret
// keys carry `set` (whether a value is stored) and never return the value.
export interface AppConfigOption {
  value: string;
  label: string;
}

export interface AppConfigItem {
  key: string;
  category: string;
  type: 'string' | 'number' | 'bool' | 'secret' | 'enum';
  label: string;
  // Closed value set — present only on type 'enum' (rendered as a dropdown).
  options?: AppConfigOption[];
  // Inclusive bounds — present only on bounded type 'number' keys. The API rejects
  // out-of-range writes; these just let the input carry the same limits.
  min?: number;
  max?: number;
  restartRequired: boolean;
  value?: string | null;
  set?: boolean;
  isDefault: boolean;
  updatedAt: number | null;
}

export class AssetHolder {
  constructor (
    public holder: string,
    public balance: number,
    public cost: number
  ) {}
}

export class SubscriptionHolding {
  constructor (
    public asset: string,
    public assetName: string,
    public assetSymbol: string,
    public currencyCode: string,
    public balance: number,
    public cost: number,
    public currentBid: number,
    public withheld: number = 0,
    public available: number = 0,
    public regulatorHeld?: number,
    public regulatorActiveHolds?: number
  ) {}
}

// Regulator-scoped freeze record on (asset, account). The entity is read-only —
// holds are placed and released regulator-side. amount/released/remaining are
// stringified uint256 token counts (plain integers — NOT wei). state names:
// 1=Active, 2=PartiallyReleased, 3=Released.
export class RegulatorHold {
  constructor (
    public assetAddress: string,
    public holdId: number,
    public accountAddress: string,
    public amount: string,
    public released: string,
    public remaining: string,
    public state: number,
    public stateName: string,
    public reason: string,
    public releaseReason: string,
    public blockNumber: number,
    public createdAt: number,
    public lastUpdate: number,
    // Acting authority (custodian hold grant, 2026-07-30): the asset's regulator or an
    // attached external custodian service. Empty on pre-cutover rows.
    public placedBy: string = '',
    public releasedBy: string = ''
  ) {}
}

export class Asset {
  constructor (
    public address: string,
    public name: string,
    public symbol: string,
    // tokenType: leaf template kind. V1: 1 = T20. T3643 follow-up will add 2.
    public tokenType: number,
    public tokenTypeName: string,
    public assetType: number,
    public assetTypeName: string,
    public metadata: string,
    public totalSupply: number,
    public circulating: number,
    public countryCode: number,
    public countryName: string,
    public currencyCode: string,
    public currencyName: string,
    public createdOn: number,
    public services: AssetService[],
    public issuer: string,
    public issuerName: string,
    public manager: string,
    public managerName: string,
    public regulator: string,
    public regulatorName: string,
    public regulatorSymbol: string,
    public suspended: boolean,
    public creditSettlement: boolean,
    public state: number,
    public stateName: string,
    public priceMode: number = 2,
    public priceModeName?: string,
    // supplyMode: 1 = Fixed (initialSupply minted to asset at init; subscribe transfers).
    //             2 = Dynamic (subscribe mints, redeem burns).
    // Immutable post-create. Set by the T20Template consolidation — replaces the old
    // tokenType=1/2 distinction at this level (tokenType now records the leaf-template kind).
    public supplyMode: number = 1,
    public supplyModeName?: string,
    // canManage: server-derived — true when the asset's on-chain `manager` is
    // this entity's template, i.e. the address the Entity API relays writes as.
    // TarmiizT20._chkManager is a strict equality, so this decides whether ANY
    // manager-gated write (mint / burn / change state / metadata / fee config)
    // can succeed. It is a capability hint for gating buttons, NOT an
    // authorization check — the contract is the only enforcement.
    public canManage: boolean = false
  ) {}
}

export class AssetPrice {
  constructor (
    public bid: number,
    public ask: number,
    public timestamp: number
  ) {}
}

export class AssetTransaction {
  constructor (
    public trxId: number,
    public serviceTrxId: number,
    public trxType: string,
    public sender: string,
    public manager: string,
    public managerName: string,
    public service: string,
    public serviceName: string,
    public asset: string,
    public assetName: string,
    public assetSymbol: string,
    public currencyCode: string,
    public from: string,
    public to: string,
    public subscription: string,
    public tokens: number,
    public price: number,
    public totalPrice: number,
    public data: string,
    public trxRefNo: string,
    public time: number
  ) {}
}

export class CreditBalance {
  constructor (
    public currencyCode: number,
    public currencyName: string,
    public currencySymbol: string,
    public balance: number,
    public withheld: number = 0,
    public available: number = 0
  ) {}
}

export class CreditTransaction {
  constructor (
    public trxId: number,
    public service: string,
    public serviceName: string,
    public paymentProcessor: string,
    public paymentProcessorName: string,
    public from: string,
    public fromName: string,
    public to: string,
    public toName: string,
    public trxType: number,
    public trxTypeName: string,
    public currencyCode: number,
    public currencySymbol: string,
    public amount: number,
    public trxData: string,
    public trxState: number,
    public trxStateName: string,
    public startTime: number,
    public updateTime: number,
    public assetTrxId: number = 0,
    public origin: number = 0,
    public originName: string = '',
    // Fee-leg link (0 = principal row) — see CreditFeeOpsLib / Transactions.parentTrxId.
    public parentTrxId?: number,
    // External service-provider transaction reference (readable).
    public trxRefNo?: string,
    // IPFS CID of the SP-receipt document owned by the SERVICE template ('' when none).
    public dataCid?: string
  ) {}
}

// ─── Connect (messaging) ────────────────────────────────────────────────────

// partyType: 1 = Identity, 2 = Entity, 3 = Regulator
// thread state: 1 = Open, 2 = Closed, 3 = Archived
// message state: 1 = Sent, 2 = Tombstoned
// contentType: 1 = text, 2 = document, 3 = notification, 4 = broadcast

export class ConnectParticipant {
  constructor(
    public address: string,
    public partyType: number | null,
    // Connect v2 mutable membership: 1 = active, 2 = removed/left (history retained)
    public state: number = 1
  ) {}
}

export class ConnectThread {
  constructor(
    public id: number,
    public creator: string,
    public creatorType: number,
    public subject: string,
    public metadataCid: string,
    public state: number,
    public createdAt: number,
    public messageCount: number,
    public lastMessageAt: number,
    public participantCount: number,
    public participants: ConnectParticipant[] = [],
    public subscriptions: string[] = [],
    public unreadCount: number = 0,
    public createdByUserId: string | null = null
  ) {}
}

// One resolved Target of a Connect v2 message. userId is the bytes32 hex
// (zero-hash = the whole party); handle is the addressed user's Connect
// handle when the mirror knows one.
export interface ConnectMessageRecipient {
  party: string;
  userId: string;
  handle?: string | null;
  readAt?: number | null;
  readByUserId?: string | null;
}

// Attachment metadata decoded from the encrypted envelope by the API.
export interface ConnectAttachmentMeta {
  cid: string;
  name?: string;
  fileType?: string;
  size?: number;
}

export class ConnectMessage {
  constructor(
    public id: number,
    public threadId: number,
    public sender: string,
    public recipients: ConnectMessageRecipient[],
    public contentCid: string,
    public attachmentCids: string[],
    public contentType: number,
    public state: number,
    public sentAt: number,
    public isDirect: boolean = false,
    public createdByUserId: string | null = null
  ) {}
}

// ─── Documents ──────────────────────────────────────────────────────────────
// documentType:  1 = Public (plaintext on IPFS), 2 = Private (AES-GCM; per-recipient wrapped DEK)
// documentState: 1 = Active, 2 = Deleted
// Share flow: API owns envelope encryption. Frontends post raw files via multipart and receive
// rendered files via the streaming endpoint — no client-side crypto for documents.

export class DocumentShare {
  constructor(
    public ownerAddress: string,
    public documentId: number,
    public sharedWithAddress: string,
    public cid: string | null,
    public title: string | null,
    public documentType: number | null,
    public sharedAt: number,
    public updatedAt: number,
  ) {}
}

export class DocumentSignature {
  constructor(
    public signer: string,
    public docHash: string,
    public signature: string,
    public reviewState: number,
    public submitter: string,
    public signedAt: number,
    public reviewStateName?: string
  ) {}
}

// One entry in a document's append-only upload ledger. The first block is mirrored from the
// on-chain DocumentVersionAdded event; the rest is API-only upload metadata and is null for
// versions this tenant didn't upload (pre-pinned content, or a foreign owner's document).
export class DocumentVersion {
  constructor(
    public version: number,
    public cid: string,
    public documentType: number,
    public addedBy: string,
    public createdByUserId: number,
    public createdAt: number,
    public fileName: string | null = null,
    public fileSize: number | null = null,
    public mimeType: string | null = null,
    public contentSha256: string | null = null,
    public actorUserId: number | null = null,
    public actorUserName: string | null = null,
    public clientIp: string | null = null,
    public txHash: string | null = null
  ) {}
}

export class Document {
  constructor(
    public id: number,
    public cid: string,
    public title: string,
    public description: string,
    public fileType: string,
    public documentType: number,
    public documentState: number,
    public owner: string,
    public createdByUserId: number,
    public createdAt: number,
    public updatedAt: number,
    public documentTypeName?: string,
    public documentStateName?: string
  ) {}
}

export class ConnectInboxState {
  constructor(
    public registered: boolean,
    public doNotDisturb: boolean,
    public partyType: number,
    public countryCode: number,
    public unread: number,
    public blockedCount: number,
    public blocks: string[] = []
  ) {}
}

export class DexVenue {
  constructor(
    public serviceAddress: string,
    public serviceName: string,
    public entityAddress: string,
    public entityName: string,
    public countryCode: number,
    public countryName: string,
    public state: number,
    public suspended: boolean,
    public suspendedReason: string,
    public registeredAt: number,
    public updatedAt: number,
    public tier1Pending: boolean = false,
    public tier1Approved: boolean = false,
    public tier2Pending: boolean = false,
    public tier2Approved: boolean = false,
    public tier3Pending: boolean = false,
    public tier3Approved: boolean = false,
    // 1 = Venue-settled (venue holds client funds), 2 = Member-settled
    // (traditional exchange — all trading through member brokerages).
    // Immutable after creation.
    public settlementMode: number = 1,
  ) {}
}

// One (venue, member) row of the venue-membership junction — the brokerage
// surface. Lifecycle: venue invites (state 1 Pending) → member ACCEPTS
// (accepted = true) → the VENUE's regulator approves (state 2 Approved).
export interface DexVenueMember {
  dexService: string;
  memberService: string;
  state: number;              // 1 = Pending, 2 = Approved (regulator-side)
  accepted: boolean;          // member consent
  addedAt: number;            // MILLISECONDS
  updatedAt: number;          // MILLISECONDS
  venueName: string;
  venueEntityName: string;
  memberName: string;
  memberEntityName: string;
}

export class DexAssetListingVenue {
  constructor(
    public baseAsset: string,
    public tier: number,
    public dexService: string,
    public dexServiceName: string,
    public assetName: string,
    public assetSymbol: string,
    public entityAddress: string,
    public entityName: string,
    public countryCode: number | null,
    public countryName: string,
    public venueState: number,
    public venueSuspended: boolean,
    public tier1Approved: boolean,
    public tier2Approved: boolean,
    public tier3Approved: boolean,
    public addedAt: number,
    public updatedAt: number = 0,
    // Regulator sign-off on THIS (asset, venue) pairing: 1 = Pending, 2 = Approved.
    // Separate from venueState (the venue's own lifecycle) — an Active venue still
    // cannot trade this asset until the asset's regulator approves the pairing.
    public state: number = 1,
  ) {}
}

export class DexAssetListing {
  constructor(
    public baseAsset: string,
    public assetName: string,
    public assetSymbol: string,
    public assetRegulator: string,
    public regulatorName: string,
    public assetCurrencyCode: number,
    public assetCurrencyName: string,
    public listedBy: string,
    public listedByName: string,
    public listedByEntity: string,
    public entityCountryCode: number | null,
    public entityCountryName: string,
    public venuePending: boolean,
    public countryPending: boolean,
    public globalPending: boolean,
    public venueApproved: boolean,
    public countryApproved: boolean,
    public globalApproved: boolean,
    public listedAt: number,
    public updatedAt: number,
    // ISSUER-SIDE ONLY — the API leaves this unmaintained when isOwnListing is false
    // (every input is tenant-local, so it cannot be computed for a foreign issuer).
    public upstream: { issuerEntityState: number; assetTradable: boolean; syncedAt: number } = { issuerEntityState: 0, assetTradable: false, syncedAt: 0 },
    // Which side of the listing we are on: true = we issued it, false = a foreign
    // issuer's asset enabled on a venue WE operate (tier 2/3). The issuer-only
    // actions revert on-chain for a hosted listing, so they are hidden for it.
    public isOwnListing: boolean = true,
  ) {}
}

export interface DexOrder {
  orderId: number;
  dexService: string;
  dexServiceName?: string;
  subscription: string;
  subscriptionName?: string;
  baseAsset: string;
  assetName?: string;
  assetSymbol?: string;
  side: number;
  sideName?: string;
  marketScope: number;
  marketScopeName?: string;
  price: string;
  amount: string;
  filled: string;
  remaining: string;
  status: number;
  statusName?: string;
  withholdTrxId: number;
  creditWithheld: string;
  assetWithheld: string;
  currencyCode: number;
  currencyName?: string;
  countryCode: number;
  countryName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DexTrade {
  tradeId: number;
  buyOrderId: number;
  sellOrderId: number;
  buyDexService: string;
  buyDexServiceName?: string;
  sellDexService: string;
  sellDexServiceName?: string;
  baseAsset: string;
  assetName?: string;
  assetSymbol?: string;
  buyer: string;
  buyerName?: string;
  seller: string;
  sellerName?: string;
  amount: string;
  price: string;
  creditAmount: string;
  currencyCode: number;
  currencyName?: string;
  marketScope: number;
  marketScopeName?: string;
  countryCode: number;
  countryName?: string;
  executedAt: number;
}

export interface OrderBookSnapshot {
  baseAsset: string;
  bestBid: { orderId: number; price: string; amount?: string } | null;
  bestAsk: { orderId: number; price: string; amount?: string } | null;
  bids: DexOrder[];
  asks: DexOrder[];
}

// ─── Maker/checker approvals ─────────────────────────────────────────────────

export type ApprovalRole = 'none' | 'maker' | 'checker';

export const APPROVAL_STATE_NAMES: Record<number, string> = {
  1: 'Pending',
  2: 'Approved',
  3: 'Rejected',
  4: 'Cancelled',
  5: 'Execution failed',
};

export class PendingApproval {
  constructor(
    public requestId: string,
    public actionCategory: string,
    public targetType: string,
    public targetAddress: string,
    public targetLabel: string | null,
    public payload: any,
    public makerUserId: string,
    public makerUserName: string | null,
    public makerReason: string | null,
    public approvalState: number,
    public approvalStateName: string,
    public checkerUserId: string | null,
    public checkerUserName: string | null,
    public checkerReason: string | null,
    public decisionAt: number | null,
    public executionTxHash: string | null,
    public executionAt: number | null,
    public executionError: string | null,
    public notificationThreadId: string | null,
    public createdAt: number,
    public updatedAt: number,
  ) {}

  static fromApi(r: any): PendingApproval {
    let payload: any = {};
    try { payload = r.payload_json ? JSON.parse(r.payload_json) : {}; } catch { payload = {}; }
    const state = Number(r.approval_state);
    return new PendingApproval(
      r.request_id,
      r.action_category,
      r.target_type,
      r.target_address,
      r.target_label ?? null,
      payload,
      r.maker_user_id,
      r.maker_user_name ?? null,
      r.maker_reason ?? null,
      state,
      APPROVAL_STATE_NAMES[state] || 'Unknown',
      r.checker_user_id ?? null,
      r.checker_user_name ?? null,
      r.checker_reason ?? null,
      r.decision_at != null ? Number(r.decision_at) : null,
      r.execution_tx_hash ?? null,
      r.execution_at != null ? Number(r.execution_at) : null,
      r.execution_error ?? null,
      r.notification_thread_id ?? null,
      Number(r.created_at),
      Number(r.updated_at),
    );
  }
}

export interface ApprovalPolicyRow {
  actionCategory: string;
  requiresApproval: boolean;
  updatedAt: number;
  updatedByUserId: string | null;
}

export function approvalPolicyFromApi(r: any): ApprovalPolicyRow {
  return {
    actionCategory:   r.action_category,
    requiresApproval: r.requires_approval === true || r.requires_approval === 1 || r.requires_approval === '1' || r.requires_approval === 't',
    updatedAt:        Number(r.updated_at),
    updatedByUserId:  r.updated_by_user_id ?? null,
  };
}