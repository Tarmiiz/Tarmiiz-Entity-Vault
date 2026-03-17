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

export class RegulatorData {
  constructor (
    public logo: string,
    public email: string,
    public website: string,
    public telephone: string,
    public address: string
  ){}
}

export class Regulator {
  constructor (
    public address: string,
    public name: string,
    public symbol: string,
    public data: RegulatorData,
    public countryCode: number,
    public countryName: string,
    public state: boolean,
    public stateName: string
  ){}
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
    public regulator: string,
    public regulatorName: string,
    public regulatorSymbol: string,
    public state: number,
    public stateName: string
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
    public validatorData: string,
    public validatorTrxNo: string,
    public validatorTrxTime: number,
    public regulator: string,
    public regulatorName: string,
    public createdAt: number,
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
    public serviceName: string
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
    public from: string,
    public to: string,
    public tokens: number,
    public price: number,
    public totalPrice: number,
    public data: string,
    public trxRefNo: string,
    public time: number
  ) {}
}