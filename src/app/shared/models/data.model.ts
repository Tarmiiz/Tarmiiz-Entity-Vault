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
    public currencyCode: number,
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

export class ControlEvent {
  constructor (
    public caller: string,
    public roleHash: string,
    public actionHash: string,
    public role: string,
    public action: string,
    public time: number,
    public blockNumber: number,
    public transactionHash: string
  ) {}
}

export class RegulatorEvent {
  constructor (
      public eventType: string,
      public account: string,
      public action: string,
      public blockNumber: number,
      public transactionHash: string,
      public timestamp: number
  ){}
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
    public state: boolean
  ){}
}

export class Asset {
  constructor (
    public address: string,
    public name: string,
    public symbol: string,
    public issuer: string,
    public manager: string,
    public regulator: string,
    public tokenType: number,
    public tokenTypeName: string,
    public assetType: number,
    public assetTypeName: string,
    public data: string,
    public totalSupply: number,
    public circulating: number,
    public currencyCode: number,
    public createdOn: number,
    public state: number,
    public stateName: string
  ){}
}

export class AssetHolder {
  constructor (
    public address: string,
    public balance: number
  ) {}
}

export class AssetSupplyChange {
  constructor (
    public changeType: number,
    public changeTypeName: string,
    public amount: number,
    public timestamp: number
  ) {}
}

export class AssetPrice {
  constructor (
    public bid: number,
    public ask: number,
    public timestamp: number
  ) {}
}

export class cKYCOperator {
  constructor (
    public operator: string,
    public name: string,
    public symbol: string,
    public data: string,
    public email: string,
    public mobile: string,
    public countryCode: number,
    public state: boolean
  ) {}
}