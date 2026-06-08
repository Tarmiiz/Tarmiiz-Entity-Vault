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
    public contract_kind: string | null = null
  ) {}

  get categoryLabel(): string {
    return (this.category || '').replace(/_/g, ' ');
  }

  get actionLabel(): string {
    return (this.action || '').replace(/_/g, ' ');
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
    public stateName: string
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
    public providerTypeName: string = ''
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
    public feeConfig: FeeConfig | null = null
  ) {}
}

// Fee mode: 0 = None, 1 = Bps (bps-based, value out of 10000, cap 2000), 2 = Fixed (wei amount)
export interface FeeConfig {
  buyFeeMode: number;
  buyFeeValue: string;
  buyFeeDestination: string;
  sellFeeMode: number;
  sellFeeValue: string;
  sellFeeDestination: string;
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
    public lastUpdate: number
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
    public supplyModeName?: string
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
    public originName: string = ''
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
    public partyType: number | null
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

export class ConnectMessage {
  constructor(
    public id: number,
    public threadId: number,
    public sender: string,
    public recipient: string,
    public contentCid: string,
    public contentType: number,
    public state: number,
    public sentAt: number,
    public readAt: number | null,
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
  ) {}
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
    public upstream: { issuerEntityState: number; assetTradable: boolean; syncedAt: number } = { issuerEntityState: 0, assetTradable: false, syncedAt: 0 },
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