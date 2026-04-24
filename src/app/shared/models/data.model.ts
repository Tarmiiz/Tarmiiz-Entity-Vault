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

export class AuditLog {
  constructor(
    public id: number,
    public category: string,
    public action: string,
    public actor_address: string,
    public actor_user_id: number | null,
    public actor_user_name: string,
    public target_address: string,
    public target_kind: string,
    public subject_id: string,
    public ref_no: string,
    public before_state: string,
    public after_state: string,
    public reason: string,
    public extras: string,
    public visibility: number,
    public encrypted: number,
    public tx_hash: string,
    public block_number: number,
    public log_index: number,
    public chain_time: number,
    public client_ip: string,
    public created_at: number
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
    public stateName: string
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
    public stateName: string
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
    public stateName: string = ''
  ) {}
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
    public currentBid: number
  ) {}
}

export class Asset {
  constructor (
    public address: string,
    public name: string,
    public symbol: string,
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
    public stateName: string
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
    public balance: number
  ) {}
}

export class CreditTransaction {
  constructor (
    public trxId: number,
    public service: string,
    public serviceName: string,
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
    public updateTime: number
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
    public unreadCount: number = 0
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
    public readAt: number | null
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