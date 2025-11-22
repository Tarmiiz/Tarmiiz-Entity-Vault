import { Injectable } from '@angular/core';
import { ethers, parseEther } from 'ethers';
// @ts-ignore
import * as snarkjs from 'snarkjs';
// @ts-ignore
import * as circomlibjs from 'circomlibjs';

import { environment } from '../../../environments/environment';

import GlobalVariablesAbi from '../../../assets/ABIs/GVProxy.json';
import cKYCProxyAbi from '../../../assets/ABIs/cKYCProxy.json';
import cKYCOperatorTemplateAbi from '../../../assets/ABIs/cKYCOperatorTemplate.json';
import RegulatorTemplateAbi from '../../../assets/ABIs/GRRRegulatorTemplate.json';
import AssetTemplateAbi from '../../../assets/ABIs/GARBasicTokenTemplate.json';

import { Asset, AssetHolder, AssetPrice, AssetSupplyChange, cKYCOperator, ControlEvent, Country, GlobalVariable, Key, Regulator, RegulatorData, RegulatorEvent } from '../models/data.model';

import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { CryptoService } from './crypto.service';

import { ParseProofUtils } from '../utils/parse-proof.utils';
import { error } from 'console';

export interface LoginResult {
  success: boolean;
  token?: string;
  contract?: string;
  privateKey?: string;
  error?: string;
}

export interface ZKProofData {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
  input: bigint[];
}

export interface AllEventsData {
  controlEvents: ControlEvent[];
  credentialsEvents: RegulatorEvent[];
  loginsEvents: RegulatorEvent[];
  assetEvents?: RegulatorEvent[];
}


@Injectable({
  providedIn: 'root'
})
export class RpcService {

  mF = environment.multiplyFactor;
  key: Key = new Key('', '', '');
  
  chainId = environment.chainId;

  rpcProvider = new ethers.JsonRpcProvider(environment.rpcNode);
  wsProvider = new ethers.WebSocketProvider(environment.wsNode);
  
  gvAddress = environment.GVProxyContract
  gvContract: any;
  
  ckycProxyAddress = environment.cKYCProxyContract
  ckycContract: any;
  ckycOperatorContract: any;

  regulatorContractAddress = '';
  regulatorContract: any;

  assetContract: any;

  signer: any;

  globalSalt = environment.globalSalt;

  regulatorInfo!: Regulator;
  globalVariables: GlobalVariable[] = [];
  countriesList: Country[] = [];
  
  constructor(
    private authService: AuthService,
    private storageService: StorageService,
    private cryptoService: CryptoService,
  ) {}
  
  async init(){
    await this.createWallet();
    await this.connectRegulatorContract();
    await this.connectGlobalVariables();
    await this.getCountriesList();
    // await this.getGlobalVariables();
  }

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// General
// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async getBlock() {
    try {
      const blockNumber = await this.rpcProvider.getBlockNumber();
      return { result: blockNumber, error: '' };
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching block number'};
    }
  }
  
  async createWallet() {
    try {
      const wallet = ethers.Wallet.createRandom();
      this.key.address = wallet.address;
      this.key.privateKey = wallet.privateKey;
      this.key.publicKey = wallet.publicKey;
      this.signer = new ethers.Wallet(this.key.privateKey, this.rpcProvider);
    }
    catch (error: any) {
      
    }
  }

  async setWallet() {
    try {
      const wallet = await this.storageService.get('wallet');
      this.key = JSON.parse(wallet!);
      this.signer = new ethers.Wallet(this.key.privateKey, this.rpcProvider);
      const contract = await this.storageService.get('contract');
      if(contract) { this.regulatorContractAddress = contract; }
    }
    catch (error: any) {
    }
  }

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Global Variables
// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  
  async connectGlobalVariables() {
    try {
      this.gvContract = new ethers.Contract(this.gvAddress, GlobalVariablesAbi, this.signer);
    }
    catch (error: any) {
      
    }
  }

  async getCountriesList() {
    try {
      const result = await this.gvContract.countriesList();
      this.countriesList = result.map((country: any) => ({ 
        countryId: Number(country[0]), 
        nameShort: country[1],
        nameFull: country[2],
        alpha2Code: country[3],
        alpha3Code: country[4],
        currencyName: country[5],
        currencyCode: country[6],
        callingCode: Number(country[7]),
        countryCode: Number(country[8])
      }));
      return { result: this.countriesList, error: ''};
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching countries list'};
    }
  } 

  async getCategoriesList() {
    try {
      const result = await this.gvContract.variableCategoriesList();
      return { result, error: ''};
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching categories list'};
    }
  }

  async getGlobalVariables() {
    try {
      this.globalVariables = [];
      const result = await this.getCategoriesList();
      if(result.result) {
        for(let i = 0; i < result.result.length; i++) {
          const category = result.result[i];
          const variables = await this.getGlobalVariableByCategory(category);
          if(variables) {
            const variable = variables.result.map((variable: any) => ({
              category: category,
              variableId: Number(variable[0]),
              name: variable[1],
              visible: variable[2],
            }))
            this.globalVariables.push(...variable);
          }
        }
        return { result: this.globalVariables , error: ''};
      }
      else {
        return { result: null, error: 'Error fetching assets list'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list'};
    }
  }

  async getGlobalVariableByCategory(category: string) {
    try {
      const result = await this.gvContract.variablesListByCategory(category);
      if(result) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error fetching assets list'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list'};
    }
  }

  async getSystemVariableById(category: string, id: number) {
    try {
      const result = await this.gvContract.sysvarById(category, id);
        return { result, error: ''};
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list'};
    }
  }

  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // cKYC Contract
  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async connectCKYCContract() {
    try {
      this.ckycContract = new ethers.Contract(this.ckycProxyAddress, cKYCProxyAbi, this.signer);
    }
    catch (error: any) {
    }
  }

  async cKYCOperatorRegister(
    regulatorAddress: string, 
    apiAddress: string,
    name: string, symbol: string,
    email: string, password: string, 
    countryCode: number,
    userData: string
  ) {

    try {
      
      // Initialize ParseProofUtils
      await ParseProofUtils.init();
  
      // Convert to BigInts
      const emailBigInt = ParseProofUtils.stringToBigInt(email);
      const passwordBigInt = ParseProofUtils.passwordToBigInt(password);
      const globalSaltBigInt = BigInt(this.globalSalt);
  
      // Generate hashes for contract
      const emailHashHex = ParseProofUtils.hashStringForContract(emailBigInt);
      const secretHex = ParseProofUtils.generateCommitment(emailBigInt, passwordBigInt, globalSaltBigInt);        
  
      // create & encrypt user data
      // const encryptedUserData = crypto.aesEncrypt(clientIp, process.env.ADMIN_KEY, JSON.stringify(userData));
      const encryptedUserData = userData;

      // create new wallet & connect to contract
      await this.createWallet();
      await this.connectCKYCContract();
  
      // register
      const tx = await this.ckycContract.operatorAdd(regulatorAddress, apiAddress, emailHashHex, secretHex, name, symbol,encryptedUserData, countryCode);
      const receipt = await tx.wait();
  
      // listen to contract event
      const operatorEvent = receipt.logs?.map((log: any) => this.ckycContract.interface.parseLog(log))?.find((e: any) => e?.name === 'OperatorEvent');
      if (operatorEvent) {
        const { operatorAddress, action } = operatorEvent.args;
        console.log(operatorAddress, action);
        return {
          success: true,
          contract: operatorAddress,
        };
      } else {
        console.log('No OperatorEvent event found in receipt');
        return { success: false };
      }      
  
    }
    catch (error) {
      console.error(error);
      return {
        success: false,
        contract: ''
      };
    }
  }

  async cKYCOperatorsList() {
    try {
      const iface = new ethers.Interface([
        "function operatorsListByCountry(uint256 countryCode, uint256 start, uint256 offset) external view returns (uint256 count, tuple(address operator, string name, string symbol, string data, uint256 countryCode, bool state)[] operators)"
      ]);
      
      const callData = iface.encodeFunctionData('operatorsListByCountry', [818, 1, 100]);
      const result = await this.callExternalStatic(this.ckycProxyAddress, callData);
      
      if (result.success && result.data !== null) {
        // console.log('result data', result.data);
        const decodedResult = iface.decodeFunctionResult('operatorsListByCountry', result.data);
        // console.log('decodedResult', decodedResult);
        
        // decodedResult[0] is the count, decodedResult[1] is the operators array
        const count = Number(decodedResult[0]);
        const operators = decodedResult[1].map((op: any) => ({
          operator: op.operator,
          name: op.name,
          symbol: op.symbol,
          data: op.data,
          countryCode: Number(op.countryCode),
          state: op.state
        }));
        
        return { result: { count, operators }, error: '' };
      } else {
        return { result: null, error: 'Error fetching operators list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching operators list: ' + error.message};
    }
  }

  async cKYCOperatorInfo(address: string) {
    try {
      const iface = new ethers.Interface([
        "function operatorInfo(address operator) external view returns (tuple(address operator, string name, string symbol, string data, uint256 countryCode, bool state) operator)"
      ]);
      
      const callData = iface.encodeFunctionData('operatorInfo', [address]);
      const result = await this.callExternalStatic(this.ckycProxyAddress, callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('operatorInfo', result.data);
        const parsedData = JSON.parse(decodedResult[0][3]);
        const operator: cKYCOperator = {
          operator: decodedResult[0][0],
          name: decodedResult[0][1],
          symbol: decodedResult[0][2],
          data: decodedResult[0][3],
          email: parsedData.email,
          mobile: parsedData.mobile,
          countryCode: Number(decodedResult[0][4]),
          state: decodedResult[0][5]
        };
        return { result: { operator }, error: '' };
      } else {
        return { result: null, error: 'Error fetching operators list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching operators list: ' + error.message};
    }
  }

  async cKYCOperatorChangeState(address: string, state: boolean) {
    try {
      const iface = new ethers.Interface(["function operatorUpdateState(address operator, bool state) external returns (bool)"]);
      const callData = iface.encodeFunctionData('operatorUpdateState', [address, state]);
      const result = await this.callExternal(this.ckycProxyAddress, callData);
      if(result !== null) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error changing operator state'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error changing operator state: ' + error.message};
    }

  }
  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Regulator Contract
  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async connectRegulatorContract() {
    try {
      this.regulatorContract = new ethers.Contract(this.regulatorContractAddress, RegulatorTemplateAbi, this.signer);
    }
    catch (error: any) {
    }
  }

  async login(username: string, password: string, sessionDuration: number = 3600) {
    try {
      if (!username || !password) {
        return { success: false, error: "Username and password required" };
      }

      if (!Number.isInteger(sessionDuration) || sessionDuration <= 0) {
        return { success: false, error: "Invalid session duration" };
      }

      // Initialize ParseProofUtils
      await ParseProofUtils.init();

      // Convert credentials to BigInts using ParseProofUtils (same as backend)
      const emailBigInt = ParseProofUtils.stringToBigInt(username);
      const passwordBigInt = ParseProofUtils.passwordToBigInt(password);
      const globalSaltBigInt = BigInt(this.globalSalt);
      
      // Generate contract lookup hash using ParseProofUtils
      const emailHashHex = ParseProofUtils.hashStringForContract(emailBigInt);
      
      // Get nonce and stored commitment
      const nonce = await this.regulatorContract.nonce();
      const storedCommitmentHex = await this.regulatorContract.commitment();
      
      // Convert stored commitment to circuit format
      const storedCommitmentBigInt = BigInt(storedCommitmentHex);
      const storedCommitmentString = storedCommitmentBigInt.toString();

      // Get emailHash for circuit using ParseProofUtils (exactly like backend)
      const emailHashForCircuit = ParseProofUtils.hashStringForContract(emailBigInt);
      const emailHashBigInt = BigInt(emailHashForCircuit);
      const emailHashString = emailHashBigInt.toString();

      // Prepare circuit input (same structure as backend)
      const circuitInput = {
        // Private inputs
        email: emailBigInt.toString(),
        password: passwordBigInt.toString(),
        salt: globalSaltBigInt.toString(),
        // Public inputs
        emailHash: emailHashString,
        storedCommitment: storedCommitmentString,
        nonce: nonce.toString()
      };

      // Generate proof - you'll need the circuit files in your assets
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInput,
        "assets/zk/Login.wasm",
        "assets/zk/Login_final.zkey"
      );

      // Parse proof for contract using ParseProofUtils
      const { a, b, c, input: proofInput } = await ParseProofUtils.parseProof({ proof, publicSignals });

      // Sign message with new wallet (exactly like backend)
      const message = ethers.solidityPacked(["string", "address"], ["Set owner to:", this.key.address]);
      const messageHash = ethers.keccak256(message);
      const signedMessage = await this.signer.signMessage(ethers.getBytes(messageHash));

      // Submit login transaction (exactly like backend)
      const tx = await this.regulatorContract.login(
        [a[0].toString(), a[1].toString()], 
        [[b[0][0].toString(), b[0][1].toString()], [b[1][0].toString(), b[1][1].toString()]], 
        [c[0].toString(), c[1].toString()], 
        proofInput.map(p => p.toString()), 
        signedMessage, 
        sessionDuration, 
        { gasLimit: 2000000 }
      );
      await tx.wait();

      const authorized = await this.isAuthorized();
      if(authorized) {
        this.storageService.set('contract', this.regulatorContractAddress);
        this.storageService.set('wallet', JSON.stringify(this.key));
        this.authService.login();
        return {
          success: true,
          contract: this.regulatorContractAddress
        };
      }
      else {
        return {
          success: false,
          contract: this.regulatorContractAddress
        };
      }
    } 
    catch (error: any) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error.message || error.reason || 'Login failed' 
      };
    }
  }

  async logout() {    
    try {
      const tx = await this.regulatorContract.logout();
      const receipt = await tx.wait();
      return { result: receipt, error: '' };
    }
    catch (error: any) {
      return { result: null, error: 'Error logging out'};
    }
  }

  async isAuthorized() {    
    try {
      const result = await this.regulatorContract.isAuthorized();
      return { result, error: '' };
    }
    catch (error: any) {
      return { result: null, error: 'Error checking authorization'};
    }
  }

  async info() {    
    try {
      const result = await this.regulatorContract.info();
      if(result) { 
        const data = JSON.parse(result[3]);

        this.regulatorInfo = {
          address: result[0],
          name: result[1],
          symbol: result[2],
          data: {
            logo: data.logo,
            email: data.email,
            website: data.webiste,
            telephone: data.telephone,
            address: data.address
          },
          countryCode: result[4],
          state: result[5]
        };
        // console.log('this.regulatorInfo', this.regulatorInfo);
      }
      return { result, error: '' };
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching info'};
    }

  }

  async assetsList() {   
    try {
      const result = await this.regulatorContract.listAssets(1, 100);
      if(result) {
        const count = Number(result[0]);
        const addresses = result[1];
        let assets: any[] = [];
        if (count > 0) {
          for (let i = 0; i < count; i++) {
            const asset = await this.assetInfo(addresses[i]);
            // console.log('asset', asset);
            if(asset.result) {
              assets.push(asset.result);
            }
          }
        }
        return { result: { count, assets }, error: ''};
      }
      else {
        return { result: null, error: 'Error fetching assets list'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list'};
    }
  }

  async callExternal(address: string, callData: string) {
    try {
      await this.connectRegulatorContract();
      // console.log('address', address);
      const tx = await this.regulatorContract.callExternal(address, callData, { gasLimit: 5000000 });
      const receipt = await tx.wait();
      // console.log('callExternal', receipt)
      return { result: receipt.blockNumber, error: '' };
    }
    catch (error: any) {
      console.error('Full error:', error);
      return { 
        result: null, 
        error: error.message || 'Error calling external contract'
      };
    }
  }

  async callExternalStatic(address: string, callData: string) {
    try {
      await this.connectRegulatorContract();
      const result = await this.regulatorContract.callExternal.staticCall(address, callData);
      return { 
        success: result[0], 
        data: result[1],
        error: '' 
      };
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching asset suspension status: ' + error.message};
    }
  }

  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Asset Contract
  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async connectAssetContract(address: string) {
    try {
      this.assetContract = new ethers.Contract(address, AssetTemplateAbi, this.signer);
    }
    catch (error: any) {
      console.error('Asset connection error:', error);
    }
  }

  async assetInfo(address: string) {
    try {

      await this.connectAssetContract(address);
      const result = await this.assetContract.info();
      if(result) { 
        // const asset: Asset = new Asset(result[0], result[1], result[2], result[3], result[4], result[5], Number(result[6]), Number(result[7]), result[8], Number(result[9]), Number(result[10]), Number(result[11]), Number(result[12]), Number(result[13]));
        
        const tokenTypeName = this.globalVariables.find(variable => variable.category === 'Asset Token Type' && variable.variableId === Number(result[6]))?.name;
        const assetTypeName = this.globalVariables.find(variable => variable.category === 'Asset Type' && variable.variableId === Number(result[7]))?.name;
        const stateName = this.globalVariables.find(variable => variable.category === 'Asset State' && variable.variableId === Number(result[13]))?.name;

        const asset: Asset = {
          address: result[0],
          name: result[1],
          symbol: result[2],
          issuer: result[3],
          manager: result[4],
          regulator: result[5],
          tokenType: Number(result[6]),
          tokenTypeName: tokenTypeName!,
          assetType: Number(result[7]),
          assetTypeName: assetTypeName!,
          data: result[8],
          totalSupply: Number(result[9]),
          circulating: Number(result[10]),
          currencyCode: Number(result[11]),
          createdOn: Number(result[12]),
          state: Number(result[13]),
          stateName: stateName!
        }
        return { result: asset, error: ''};
      }
      else {
        return { result: null, error: 'Error fetching asset info'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching asset info'};
    }

  }

  async assetIsSuspended(address: string) {
    try {
      const iface = new ethers.Interface(["function isSuspended() external view returns (bool)"]);
      const callData = iface.encodeFunctionData('isSuspended', []);
      const result = await this.callExternalStatic(address, callData);
      if (result.success && result.data !== null) {
        console.log('result data', result.data);
        const decodedResult = iface.decodeFunctionResult('isSuspended', result.data);
        console.log('decodedResult', decodedResult);
        return { result: decodedResult[0], error: '' };
      } else {
        return { result: null, error: 'Error fetching asset suspension status' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching asset suspension status: ' + error.message};
    }

  }

  async assetSuspend(address: string, state: boolean) {
    try {
      console.log('state', state);
      const iface = new ethers.Interface(["function suspend(bool halt) external returns (bool)"]);
      const callData = iface.encodeFunctionData('suspend', [state]);
      const result = await this.callExternal(address, callData);
      console.log('result', result);
      if(result !== null) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error fetching asset suspension status'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching asset suspension status: ' + error.message};
    }

  }

  async assetHoldersList(address: string, start: number, offset: number) {
    try {
      await this.connectAssetContract(address);
      const result = await this.assetContract.getHolders(start, offset);
      if(result) { 
        const holders: AssetHolder = {
          address: result[0],
          balance: Number(result[1])
        }
  
        return { result: holders , error: ''};
      }
      else {
        return { result: null, error: 'Error fetching asset holders'};
      }
    }
    catch (error: any) {
        return { result: null, error: 'Error fetching asset holders'};
    }
  }

  async assetBalanceOf(address: string, account: string) {
    try {
      await this.connectAssetContract(address);
      const result = await this.assetContract.balanceOf(account);
      if(result) { 
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error fetching asset info'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching asset info'};
    }

  }

  async assetSupplyChanges(address: string, start: number, offset: number) {
    try {
      await this.connectAssetContract(address);
      const result = await this.assetContract.getSupplyChanges(start, offset);
      console.log('result', result);
      if(result) { 

        const changes: AssetSupplyChange[] = result[1].map((change: any) => ({
          changeType: Number(change[0]),
          changeTypeName: this.globalVariables.find(variable => variable.category === 'Asset Supply Change' && variable.variableId === Number(change[0]))?.name,
          amount: Number(change[1]),
          timestamp: Number(change[2])
        }))

        return { result: changes , error: ''};
      }
      else {
        return { result: null, error: 'Error fetching asset supply changes'};
      }
    }
    catch (error: any) {
        return { result: null, error: 'Error fetching asset supply changes'};
    }
  }

  async assetPriceCurrent(address: string) {
    try {
      await this.connectAssetContract(address);
      const result = await this.assetContract.getCurrentPrice();
      if(result) { 
        const price: AssetPrice = {
          bid: Number(ethers.formatEther(result[0])),
          ask: Number(ethers.formatEther(result[1])),
          timestamp: Number(result[2])
        };
        return { result: { price } , error: ''};
      }
      else {
        return { result: null, error: 'Error fetching asset price history'};
      }
    }
    catch (error: any) {
        return { result: null, error: 'Error fetching asset price history: ' + error};
    }
  }

  async assetPriceHistory(address: string, start: number, offset: number) {
    try {
      await this.connectAssetContract(address);
      const result = await this.assetContract.getPriceHistory(start, offset);
      if(result) { 
        const count = Number(result[0]);
        const prices: AssetPrice[] = result[1].map((price: any) => ({
          bid: Number(ethers.formatEther(price[0])),
          ask: Number(ethers.formatEther(price[1])),
          timestamp: Number(price[2])
        }))
        prices.reverse();
        return { result: { count, prices } , error: ''};
      }
      else {
        return { result: null, error: 'Error fetching asset price history'};
      }
    }
    catch (error: any) {
        return { result: null, error: 'Error fetching asset price history: ' + error};
    }
  }

  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Regulator Contract: Event Functions
  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async getControlEvents(fromBlock: number | string = 0, toBlock: number | string = 'latest'): Promise<ControlEvent[]> {
    try {
      const filter = this.regulatorContract.filters.ControlEvent();
      const events = await this.regulatorContract.queryFilter(filter, fromBlock, toBlock);

      return events.map((event: any) => ({
        caller: event.args.caller,
        roleHash: event.args.roleHash,
        actionHash: event.args.actionHash,
        role: event.args.role,
        action: event.args.action,
        time: event.args.time,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      }));
    } catch (error) {
      console.error('Error fetching ControlEvent events:', error);
      throw error;
    }
  }

  async getAllContractEvents(fromBlock: number | string = 0, toBlock: number | string = 'latest'): Promise<RegulatorEvent[]> {
    try {
      // Create filters for all event types
      const loginFilter = this.regulatorContract.filters.loginEvent();
      const credentialsFilter = this.regulatorContract.filters.credentialsEvent();
      const assetFilter = this.regulatorContract.filters.assetEvent();

      // Query all events
      const [loginEvents, credentialsEvents, assetEvents] = await Promise.all([
        this.regulatorContract.queryFilter(loginFilter, fromBlock, toBlock),
        this.regulatorContract.queryFilter(credentialsFilter, fromBlock, toBlock),
        this.regulatorContract.queryFilter(assetFilter, fromBlock, toBlock)
      ]);

      // Process all events with timestamps
      const allEvents = await Promise.all([
        ...loginEvents.map(async (event: any) => ({
          account: event.args.account,
          eventType: 'Login',
          action: event.args.action,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          timestamp: (await this.rpcProvider.getBlock(event.blockNumber))?.timestamp || 0
        })),
        ...credentialsEvents.map(async (event: any) => ({
          account: event.args.account,
          eventType: 'Credentials',
          action: event.args.action,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          timestamp: (await this.rpcProvider.getBlock(event.blockNumber))?.timestamp || 0
        })),
        ...assetEvents.map(async (event: any) => ({
          asset: event.args.asset,
          eventType: 'Asset',
          action: event.args.action,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          timestamp: (await this.rpcProvider.getBlock(event.blockNumber))?.timestamp || 0
        }))
      ]);

      // Sort events by block number (newest first)
      allEvents.sort((a, b) => b.blockNumber - a.blockNumber);

      return allEvents;
    } catch (error) {
      console.error('Error fetching contract events:', error);
      throw error;
    }
  }

  async getAllEvents(fromBlock: number | string = 0, toBlock: number | string = 'latest'): Promise<AllEventsData> {
    try {
      const [controlEvents, contractEvents] = await Promise.all([
        this.getControlEvents(fromBlock, toBlock),
        this.getAllContractEvents(fromBlock, toBlock)
      ]);

      // Separate contract events by type
      const loginsEvents = contractEvents.filter(event => event.eventType === 'login');
      const credentialsEvents = contractEvents.filter(event => event.eventType === 'credentials');
      const assetEvents = contractEvents.filter(event => event.eventType === 'asset');

      return {
        controlEvents,
        credentialsEvents,
        loginsEvents,
        assetEvents
      };
    } catch (error) {
      console.error('Error fetching all events:', error);
      throw error;
    }
  }

  listenToControlEvents(callback: (event: ControlEvent) => void): void {
    const wsContract = new ethers.Contract(
      this.regulatorContractAddress, 
      RegulatorTemplateAbi, 
      this.wsProvider
    );

    wsContract.on('ControlEvent', (caller, roleHash, actionHash, role, action, time, event) => {
      callback({
        caller,
        roleHash,
        actionHash,
        role,
        action,
        time,
        blockNumber: event.log.blockNumber,
        transactionHash: event.log.transactionHash
      });
    });
  }

  // listenToCredentialsEvents(callback: (event: RegulatorEvent) => void): void {
  //   const wsContract = new ethers.Contract(
  //     this.regulatorContractAddress, 
  //     RegulatorTemplateAbi, 
  //     this.wsProvider
  //   );

  //   wsContract.on('credentials', (account, action, event) => {
  //     callback({
  //       account,
  //       action,
  //       blockNumber: event.log.blockNumber,
  //       transactionHash: event.log.transactionHash
  //     });
  //   });
  // }

  // listenToLoginsEvents(callback: (event: RegulatorEvent) => void): void {
  //   const wsContract = new ethers.Contract(
  //     this.regulatorContractAddress, 
  //     RegulatorTemplateAbi, 
  //     this.wsProvider
  //   );

  //   wsContract.on('logins', (account, action, event) => {
  //     callback({
  //       account,
  //       action,
  //       blockNumber: event.log.blockNumber,
  //       transactionHash: event.log.transactionHash
  //     });
  //   });
  // }

  async stopListening(): Promise<void> {
    const wsContract = new ethers.Contract(
      this.regulatorContractAddress,
      RegulatorTemplateAbi,
      this.wsProvider
    );

    await wsContract.removeAllListeners();
    await this.wsProvider.removeAllListeners();
  }

  listenToNewBlocks(callback: (blockNumber: number, transactions: number, timestamp: number) => void): void {
    this.wsProvider.on('block', async (blockNumber) => {
      try {
        const block = await this.rpcProvider.getBlock(blockNumber);
        if (block) {
          callback(blockNumber, block.transactions.length, block.timestamp);
        }
      } catch (error) {
        console.error('Error fetching block data:', error);
      }
    });
  }
}
