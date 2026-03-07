import { inject, Injectable, signal } from '@angular/core';
import { ethers } from 'ethers';
// @ts-ignore
import * as snarkjs from 'snarkjs';

import { environment } from '../../../environments/environment';

import GlobalVariablesAbi from '../../../assets/ABIs/GlobalVariablesProxy.json';
import RegulatorTemplateAbi from '../../../assets/ABIs/RegulatorTemplate.json';

// import AssetTemplateAbi from '../../../assets/ABIs/GARBasicTokenTemplate.json';

import { ControlEvent, Key, Regulator, RegulatorEvent, Country, GlobalVariable, Operator, Validator, Service, Identity, RegulatorData, Subscription, User, Asset, AssetPrice, Entity } from '../models/data.model';

import { StorageService } from './storage.service';
import { CryptoService } from './crypto.service';

import { ParseProofUtils } from '../utils/parse-proof.utils';
import { register } from 'module';

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

  private storageService = inject(StorageService);
  private cryptoService = inject(CryptoService);

  mF = environment.multiplyFactor;
  key: Key = new Key('', '', '');
  
  globalSalt = environment.globalSalt;
  chainId = environment.chainId;

  rpcProvider = new ethers.JsonRpcProvider(environment.rpcNode);
  wsProvider = new ethers.WebSocketProvider(environment.wsNode);
  signer: any;
  
  variablesProxyContractAddress = environment.globalVariablesProxyContract
  variablesProxyContract: any;
  globalVariablesList: GlobalVariable[] = [];
  countriesList: Country[] = [];

  regulatorContractAddress = environment.regulatorAddress;
  regulatorContract: any;

  regulator!: Regulator;
  user!: User;

  assetContract: any;

  operatorAddress = signal<string>('');
  validatorAddress = signal<string>('');
  entitiesAddress = signal<string>('');
  serviceAddress = signal<string>('');
  subscriptionAddress = signal<string>('');
  assetsProxyAddress = signal<string>('');

  constructor() {}
  
  async init(){
    await this.createWallet();
    await this.connectVariablesProxyContract();
    await this.connectRegulatorContract();
    // await this.getContracts();
    // await this.getCountriesList();
    // await this.getCategoriesList();
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

  async stringToBytes32(value: string) {
    try {
      const sha256Hash = await this.cryptoService.shaHash(value);
      const withPrefix = sha256Hash.startsWith('0x') ? sha256Hash : '0x' + sha256Hash;
      return ethers.zeroPadValue(withPrefix, 32);
    }
    catch (error: any) {
      return '';
    }
  }

  async generateZKPData(username: string, password: string) {
    try {
      // Initialize ParseProofUtils
      await ParseProofUtils.init();
  
      // Convert to BigInts
      const usernameBigInt = ParseProofUtils.stringToBigInt(username);
      const passwordBigInt = ParseProofUtils.passwordToBigInt(password);
      const globalSaltBigInt = BigInt(this.globalSalt);
  
      // Generate hashes for contract
      const usernameHashHex = ParseProofUtils.hashStringForContract(usernameBigInt);
      const secretHex = ParseProofUtils.generateCommitment(usernameBigInt, passwordBigInt, globalSaltBigInt);

      // Generate login data
      return { loginHash: usernameHashHex, secret: secretHex, error: '' };
    }
    catch (error: any) {
      return { result: null, error: 'Error generating login'};
    }
    
  }

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Global Variables
// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  
  async connectVariablesProxyContract() {
    try {
      this.variablesProxyContract = new ethers.Contract(this.variablesProxyContractAddress, GlobalVariablesAbi, this.signer);
    }
    catch (error: any) {
      
    }
  }

  async getCountriesList() {
    try {
      const result = await this.variablesProxyContract.countriesList();
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
      const result = await this.variablesProxyContract.variableCategoriesList();
      return { result, error: ''};
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching categories list'};
    }
  }

  async getGlobalVariables() {
    try {
      this.globalVariablesList = [];
      const result = await this.getCategoriesList();
      if(result.result) {
        for(let i = 0; i < result.result.length; i++) {
          const category = result.result[i];
          const variables = await this.getGlobalVariableByCategory(category);
          if(variables) {
            const variable = variables.result.map((variable: any) => ({
              category: category,
              variableId: variable.variableId,
              name: variable.name,
              visible: variable.visible,
            }))
            this.globalVariablesList.push(...variable);
          }
        }
        return { result: this.globalVariablesList , error: ''};
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
      const result = await this.variablesProxyContract.variablesListByCategory(category);
      if(result) {
        const variables = result.map((variable: any) => ({
          variableId: Number(variable[0]),
          name: variable[1],
          visible: variable[2],
        }))
        return { result: variables, error: ''};
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
      const result = await this.variablesProxyContract.sysvarById(category, id);
        return { result, error: ''};
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list'};
    }
  }

  async getContractAddress(contract: string) {
    try {
      const result = await this.variablesProxyContract.contractGetAddress(contract);
      return { result, error: ''};
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching countries list'};
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
      const usernameBigInt = ParseProofUtils.stringToBigInt(username);
      const passwordBigInt = ParseProofUtils.passwordToBigInt(password);
      const globalSaltBigInt = BigInt(this.globalSalt);
      
      // Generate contract lookup hash using ParseProofUtils
      const usernameHashHex = ParseProofUtils.hashStringForContract(usernameBigInt);
      
      // Get nonce and stored commitment
      const { nonce, commitment: storedCommitmentHex } = await this.regulatorContract.getUserCredentialsData(usernameHashHex);
      
      // Convert stored commitment to circuit format
      const storedCommitmentBigInt = BigInt(storedCommitmentHex);
      const storedCommitmentString = storedCommitmentBigInt.toString();

      // Get emailHash for circuit using ParseProofUtils (exactly like backend)
      const usernameHashBigInt = BigInt(usernameHashHex);
      const usernameHashString = usernameHashBigInt.toString();

      // Prepare circuit input (same structure as backend)
      const circuitInput = {
        // Private inputs
        email: usernameBigInt.toString(),
        password: passwordBigInt.toString(),
        salt: globalSaltBigInt.toString(),
        // Public inputs
        emailHash: usernameHashString,
        storedCommitment: storedCommitmentString,
        nonce: nonce.toString()
      };

      // Generate proof
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInput,
        "assets/zk/Login.wasm",
        "assets/zk/Login_final.zkey"
      );

      // Parse proof for contract using ParseProofUtils
      const { a, b, c, input: proofInput } = await ParseProofUtils.parseProof({ proof, publicSignals });

      // Sign message with new wallet
      const message = ethers.solidityPacked(["string", "address"], ["Set owner to:", this.key.address]);
      const messageHash = ethers.keccak256(message);
      const signedMessage = await this.signer.signMessage(ethers.getBytes(messageHash));

      // Submit login transaction
      const tx = await this.regulatorContract.login(
        usernameHashHex, 
        [a[0].toString(), a[1].toString()], 
        [[b[0][0].toString(), b[0][1].toString()], [b[1][0].toString(), b[1][1].toString()]], 
        [c[0].toString(), c[1].toString()], 
        proofInput.map(p => p.toString()), 
        signedMessage, 
        sessionDuration, 
        { gasLimit: 2000000 }
      );      
      const receipt = await tx.wait();

      // listen to contract event
      const eventlog = receipt.logs?.map((log: any) => this.regulatorContract.interface.parseLog(log))?.find((e: any) => e?.name === 'UserAccess');
      if (eventlog) {
        const { userId, action } = eventlog.args;
        return {
          success: true,
          userId,
          key: this.key
        };
      } else {
        console.log('No OperatorEvent event found in receipt');
        return { success: false };
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

  async regulatorInfoGet() {    
    try {
      const result = await this.regulatorContract.info();
      if(result) { 

        // check countries list
        if (this.countriesList.length === 0) {
          await this.connectVariablesProxyContract();
          await this.getCountriesList();
        }
        // Get country name for this operator
        const countryCode = Number(result[4]);
        const country = this.countriesList.find(c => c.countryCode === countryCode);
        const countryName = country?.nameShort || 'Unknown';

        const data = JSON.parse(result[3]);
        const regulatorData: RegulatorData = {
          logo: data.logo,
          email: data.email,
          website: data.website,
          telephone: data.telephone,
          address: data.address
        };

        this.regulator = {
          address: result[0],
          name: result[1],
          symbol: result[2],
          data: regulatorData,
          countryCode,
          countryName,
          state: result[5],
          stateName: result[5] ? 'Active' : 'Inactive'
        };

        return { result: this.regulator, error: '' };

      }
      else {
        return { result: null, error: 'Error fetching info'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching info'};
    }

  }

  async regulatorInfoSet(data: string) {
    try {
      await this.connectRegulatorContract();
      const tx = await this.regulatorContract.changeData(data, { gasLimit: 5000000 });
      const receipt = await tx.wait();
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

  async externalContractGet(name: string) {
    try {
      const result = await this.regulatorContract.getContractAddress(name);
      if(result) { 
        return { result, error: '' };
      }
      else {
        return { result: null, error: 'Error fetching info'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching info'};
    }

  }

  async externalContractSet(name: string, address: string) {
    try {
      const tx = await this.regulatorContract.changeContractAddress(name, address, { gasLimit: 5000000 });
      const receipt = await tx.wait();
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

  async callExternalParallel(address: string, callData: string) {
    try {
      await this.connectRegulatorContract();
      // Get and increment nonce manually
      const nonce = await this.signer.getNonce();
      const tx = await this.regulatorContract.callExternal(address, callData, { 
        gasLimit: 5000000,
        nonce: nonce  // Explicitly set nonce
      });
      const receipt = await tx.wait();
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
  
  async callExternal(address: string, callData: string) {
    try {
      await this.connectRegulatorContract();
      const tx = await this.regulatorContract.callExternal(address, callData, { gasLimit: 5000000 });
      const receipt = await tx.wait();
      return { result: receipt, error: '' };
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
      return { result: null, error: 'Error external call: ' + error.message};
    }
  }

  async regulatorInfo(regulatorAddress: string) {
    try {
      const iface = new ethers.Interface([
        "function info() external view returns (tuple(address regulator, string name, string symbol, string data, uint256 countryCode, bool state))"
      ]);
      
      const callData = iface.encodeFunctionData('info');
      const result = await this.callExternalStatic(regulatorAddress, callData);
      if (result.success && result.data !== null) {

        
        const decodedResult = iface.decodeFunctionResult('info', result.data);
        const parsedData = JSON.parse(decodedResult[0][3]);

        // Fetch state names once
        await this.connectVariablesProxyContract();

        // get country name
        const countryCode = Number(decodedResult[0][4]);
        let countryName = 'Unknown';
        if (this.countriesList.length === 0) {
          await this.getCountriesList();
        }
        const country = this.countriesList.find(c => c.countryCode === countryCode);
        countryName = country?.nameShort || 'Unknown';        

        const regulator: Regulator = {
          address: decodedResult[0][0],
          name: decodedResult[0][1],
          symbol: decodedResult[0][2],
          data: decodedResult[0][3],
          countryCode,
          countryName,
          state: decodedResult[0][5],
          stateName: decodedResult[0][5] ? 'Active' : 'Inactive'
        };
        return { result: { regulator }, error: '' };
      } else {
        return { result: null, error: 'Error fetching regulator info' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching regulator info: ' + error.message};
    }
  }  

  async operatorInfo(operatorAddress: string) {
    try {
      const iface = new ethers.Interface([
        "function info() external view returns (tuple(address operator, string name, string symbol, string data, uint256 countryCode, bool state))"
      ]);
      
      const callData = iface.encodeFunctionData('info');
      const result = await this.callExternalStatic(operatorAddress, callData);
      if (result.success && result.data !== null) {

        const decodedResult = iface.decodeFunctionResult('info', result.data);
        const parsedData = JSON.parse(decodedResult[0][3]);

        // Fetch state names once
        await this.connectVariablesProxyContract();

        // get country name
        const countryCode = Number(decodedResult[0][4]);
        let countryName = 'Unknown';
        if (this.countriesList.length === 0) {
          await this.getCountriesList();
        }
        const country = this.countriesList.find(c => c.countryCode === countryCode);
        countryName = country?.nameShort || 'Unknown';        

        const operator: Operator = {
          operator: decodedResult[0][0],
          name: decodedResult[0][1],
          symbol: decodedResult[0][2],
          data: decodedResult[0][3],
          email: parsedData.email || '',
          mobile: parsedData.mobile || '',
          countryCode,
          countryName,
          state: decodedResult[0][5],
          stateName: decodedResult[0][5] ? 'Active' : 'Inactive'
        };
        return { result: { operator }, error: '' };
      } else {
        return { result: null, error: 'Error fetching regulator info' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching regulator info: ' + error.message};
    }
  }  

//----------------------------------------------------------------------------------------------------------------------------------------

  async userInfo(userId: number) {    
        console.log('userId', userId);

    try {
      const result = await this.regulatorContract.getUserInfo(userId);
      if(result) {

        await this.connectVariablesProxyContract();

        const statesResult = await this.getGlobalVariableByCategory('Account State');
        const stateId = Number(Number(result[3]));
        let stateName = 'Unknown';
        if (statesResult.result) {
          const stateVariable = statesResult.result.find((v: any) => v.variableId === stateId);
          stateName = stateVariable?.name || 'Unknown';
        }  

        const rolesResult = await this.getGlobalVariableByCategory('User Role');
        const roleId = Number(Number(result[2]));
        let roleName = 'Unknown';
        if (rolesResult.result) {
          const roleVariable = rolesResult.result.find((v: any) => v.variableId === roleId);
          roleName = roleVariable?.name || 'Unknown';
        }
        
        const userData = await this.cryptoService.aesDecrypt(environment.aesKEY, result[1]);
        const { username, name, email, did } = JSON.parse(userData);

        const user: User = {
          username,
          name,
          email,
          did,
          userId: Number(result[0]),
          state: stateId,
          stateName,
          role: roleId,
          roleName,
          createdAt: Number(result[4]),
          lastModifiedAt: Number(result[5])
        }
        return { result: user, error: '' };
      }
      else {
        return { result: null, error: 'Error fetching info'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching info'};
    }
  }

  async usersList(start: number, offset: number) {
    try {
      const result = await this.regulatorContract.getAllUsers(start, offset);
      if (result) {
        await this.connectVariablesProxyContract();
        const statesResult = await this.getGlobalVariableByCategory('Account State');
        const rolesResult = await this.getGlobalVariableByCategory('User Role');
        const count = Number(result.count);
        const users = result.users.map(async (user: any) => {
          const stateId = Number(Number(user[3]));
          const stateName = statesResult.result.find((v: any) => v.variableId === stateId)?.name || 'Unknown';
          const roleId = Number(Number(user[2]));
          const roleName = rolesResult.result.find((v: any) => v.variableId === roleId)?.name || 'Unknown';
          const userData = await this.cryptoService.aesDecrypt(environment.aesKEY, user[1]);
        const { username, name, email, did } = JSON.parse(userData);

          return {
            username,
            name,
            email,
            did,
            userId: Number(user[0]),
            state: stateId,
            stateName,
            role: roleId,
            roleName,
            createdAt: Number(user[4]),
            lastModifiedAt: Number(user[5])
          };
        })
        return { result: { count, users: await Promise.all(users) }, error: '' };

      } else {
        return { result: null, error: 'Error fetching validators list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching validators list: ' + error.message};
    }
  }

  async userAdd(username: string, password: string, role: number, userData: string) {
    try {
      // generate login data
      const { loginHash, secret } = await this.generateZKPData(username, password);

      // encrypt data
      const encryptedUserData = await this.cryptoService.aesEncrypt(environment.aesKEY, userData);

      // register
      const tx = await this.regulatorContract.createUser(loginHash, secret, role, encryptedUserData, 1);
      const receipt = await tx.wait();

      return { result: receipt, error: '' };
    }
    catch (error: any) {
      return { result: null, error: 'Error adding new user'};
    }
  }

  async userChangeData(userId: number, userData: string) {
    try {
      // encrypt data
      const encryptedUserData = await this.cryptoService.aesEncrypt(environment.aesKEY, userData);

      const tx = await this.regulatorContract.changeUserData(userId, encryptedUserData);
      const receipt = await tx.wait();
      return { result: receipt, error: '' };
    }
    catch (error: any) {
      return { result: null, error: 'Error adding new user'};
    }
  }

  async userChangeCredentials(userId: number, username: string, password: string) {
    try {

      // generate login data
      const { loginHash, secret } = await this.generateZKPData(username, password);

      const tx = await this.regulatorContract.resetUserCredentials(userId, loginHash, secret);
      const receipt = await tx.wait();
      return { result: receipt, error: '' };
    }
    catch (error: any) {
      return { result: null, error: 'Error adding new user'};
    }
  }

  async userChangeState(userId: number, state: number) {
    try {
      const tx = await this.regulatorContract.changeUserState(userId, state);
      const receipt = await tx.wait();
      return { result: receipt, error: '' };
    }
    catch (error: any) {
      return { result: null, error: 'Error adding new user'};
    }
  }

//----------------------------------------------------------------------------------------------------------------------------------------

  async validatorChangeName(address: string, name: string) {
    try {
      const iface = new ethers.Interface(["function overrideName(string memory name) external returns (bool)"]);
      const callData = iface.encodeFunctionData('overrideName', [name]);
      const result = await this.callExternal(address, callData);
      if(result !== null) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error changing validator name'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error changing validator name: ' + error.message};
    }

  }   

  async validatorChangeData(address: string, data: string) {
    try {
      const iface = new ethers.Interface(["function overrideData(string memory data) external returns (bool)"]);
      const callData = iface.encodeFunctionData('overrideData', [data]);
      const result = await this.callExternal(address, callData);
      if(result !== null) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error changing validator data'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error changing validator data: ' + error.message};
    }

  }  
  
  async validatorChangeState(address: string, state: number) {
    try {
      const iface = new ethers.Interface(["function overrideState(uint8 state) external returns (bool)"]);
      const callData = iface.encodeFunctionData('overrideState', [state]);
      const result = await this.callExternal(address, callData);
      if(result !== null) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error changing validator state'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error changing validator state: ' + error.message};
    }

  }

  async validatorsListAll(start: number, offset: number) {
    try {
      if(!this.validatorAddress()) await this.getContractAddress('RegulatorsProxy');
      const iface = new ethers.Interface([
        "function listByCountry(uint256 countryCode, uint256 start, uint256 offset) external view returns (uint256 count, tuple(address validator, address regulator, string name, string data, uint256 countryCode, uint8 state)[] validators)"
      ]);
      
      const callData = iface.encodeFunctionData('listByCountry', [818, start, offset]);
      const result = await this.callExternalStatic(this.validatorAddress(), callData);

      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('listByCountry', result.data);
        const { count, validators } = await this.processValidatorList(decodedResult);
        return { result: { count, validators }, error: '' };
      } else {
        return { result: null, error: 'Error fetching validators list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching validators list: ' + error.message};
    }
  }

  async validatorsListOwn(start: number, offset: number) {
    try {
      const privkey = environment.apiPrivKey;
      const apiSigner = new ethers.Wallet(privkey, this.rpcProvider);
      const apiContract = new ethers.Contract(this.regulatorContractAddress, RegulatorTemplateAbi, apiSigner);
      const result = await apiContract['validatorsListOwn'](start, offset);
      if (result) {
        const { count, validators } = await this.processValidatorList(result);
        return { result: { count, validators }, error: '' };
      } else {
        return { result: null, error: 'Error fetching validators list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching validators list: ' + error.message};
    }
  }
  
  async processValidatorList(data: any) {
    // Fetch state names once for all validators
    await this.connectVariablesProxyContract();
    const statesResult = await this.getGlobalVariableByCategory('Account State');

    // check countries list
    if (this.countriesList.length === 0) {
      await this.getCountriesList();
    }
    
    const count = Number(data[0]);
    const validators = await Promise.all(
      data[1].map(async (op: any) => {
        // console.log('result', op);
        let parsedData = null;
        try {
          parsedData = JSON.parse(op.data);
        } catch (e) {
          console.error('Error parsing operator data:', e);
        }
  
        // Get state name for this validator
        const stateId = Number(op.state);
        let stateName = 'Unknown';
        if (statesResult.result) {
          const stateVariable = statesResult.result.find((v: any) => v.variableId === stateId);
          stateName = stateVariable?.name || 'Unknown';
        }  
  
        // Get country name for this operator
        const countryCode = Number(op.countryCode);
        const country = this.countriesList.find(c => c.countryCode === countryCode);
        const countryName = country?.nameShort || 'Unknown';
        
        // get regulator name
        const regulatorAddress = op.regulator;
        let regulatorName = 'Unknown';
        let regulatorSymbol = 'Unknown';
        const regulatorsResult = await this.regulatorInfo(regulatorAddress);
        const regulator = regulatorsResult.result?.regulator;
        regulatorName = regulator?.name || 'Unknown';
        regulatorSymbol = regulator?.symbol || 'Unknown';
  
        return {
          address: op.validator,
          name: op.name,
          data: op.data,
          email: parsedData?.email || '',
          mobile: parsedData?.mobile || '',
          countryCode: Number(op.countryCode),
          countryName,
          regulator: regulatorAddress,
          regulatorName,
          regulatorSymbol,
          state: Number(op.state),
          stateName
        };
  
      })
    )

    validators.sort((a: any, b: any) => a.name.localeCompare(b.name));

    return { count, validators };    
        
  }

  async validatorInfo(validatorAddress: string) {
    try {
      const iface = new ethers.Interface([
        "function info() external view returns (tuple(address validator, address regulator, string name, string data, uint256 countryCode, uint8 state))"
      ]);
      
      const callData = iface.encodeFunctionData('info');
      const result = await this.callExternalStatic(validatorAddress, callData);
      if (result.success && result.data !== null) {

        
        const decodedResult = iface.decodeFunctionResult('info', result.data);
        const parsedData = JSON.parse(decodedResult[0][3]);

        // Fetch state names once
        await this.connectVariablesProxyContract();
        const statesResult = await this.getGlobalVariableByCategory('Account State');
        const stateId = Number(decodedResult[0][5]);
        let stateName = 'Unknown';
        if (statesResult.result) {
          const stateVariable = statesResult.result.find((v: any) => v.variableId === stateId);
          stateName = stateVariable?.name || 'Unknown';
        }

        // get country name
        const countryCode = Number(decodedResult[0][4]);
        let countryName = 'Unknown';
        if (this.countriesList.length === 0) {
          await this.getCountriesList();
        }
        const country = this.countriesList.find(c => c.countryCode === countryCode);
        countryName = country?.nameShort || 'Unknown';        

        // get regulator name
        const regulatorAddress = decodedResult[0][1];
        let regulatorName = 'Unknown';
        let regulatorSymbol = 'Unknown';
        const regulatorsResult = await this.regulatorInfo(regulatorAddress);
        const regulator = regulatorsResult.result?.regulator;
        regulatorName = regulator?.name || 'Unknown';
        regulatorSymbol = regulator?.symbol || 'Unknown';
        

        const validator: Validator = {
          address: decodedResult[0][0],
          name: decodedResult[0][2],
          data: decodedResult[0][3],
          email: parsedData.email,
          mobile: parsedData.mobile,
          countryCode: Number(decodedResult[0][4]),
          countryName,
          regulator: decodedResult[0][1],
          regulatorName,
          regulatorSymbol,
          state: Number(decodedResult[0][5]),
          stateName
        };
        return { result: { validator }, error: '' };
      } else {
        return { result: null, error: 'Error fetching validator info' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching validator info: ' + error.message};
    }
  }

  async validatorServicesList(validatorAddress: string, start: number, offset: number) {
    try {

     const iface = new ethers.Interface([
        "function listServices(uint256 start, uint256 offset) external view returns (uint256 count, tuple(address service, address regulator, address validator, string name, string data, uint256 countryCode, uint8 state)[] memory services)"
      ]);
      
      const callData = iface.encodeFunctionData('listServices', [start, offset]);
      const result = await this.callExternalStatic(validatorAddress, callData);

      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('listServices', result.data);
        const { count, services } = await this.processServicesList(decodedResult);
        return { result: { count, services } , error: ''};
      }
      else {
        return { result: null, error: 'Error fetching asset supply changes'};
      }
    }
    catch (error: any) {
        return { result: null, error: 'Error fetching asset supply changes'};
    }
  }

  async validatorIdentitiesList(validatorAddress: string, start: number, offset: number) {
    try {

     const iface = new ethers.Interface([
        "function listIdentities(uint256 start, uint256 offset) external view returns (uint256 count, tuple(bytes32 identity, address operator, string data, uint256 validatedAt)[] memory identities)"
      ]);
      
      const callData = iface.encodeFunctionData('listIdentities', [start, offset]);
      const result = await this.callExternalStatic(validatorAddress, callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('listIdentities', result.data);
        const count = Number(decodedResult[0]);
        const identities = decodedResult[1].map((identity: any) => {
          return {
            identity: identity.identity,
            operator: identity.operator,
            data: identity.data,
            validatedAt: Number(identity.validatedAt)
          };
        });
        return { result: { count, identities } , error: ''};
      }
      else {
        return { result: null, error: 'Error fetching asset supply changes'};
      }
    }
    catch (error: any) {
        return { result: null, error: 'Error fetching asset supply changes'};
    }
  }

  async validatorsIdentitiesListOwn(start: number, offset: number) {
    try {
      const iface = new ethers.Interface([
        "function listIdentitiesByRegulator(uint256 start, uint256 offset) external view returns (uint256 count, bytes32[] validators)"
      ]);
      
      const callData = iface.encodeFunctionData('listIdentitiesByRegulator', [start, offset]);
      const result = await this.callExternalStatic(this.validatorAddress(), callData);
      if (result) {
        const decodedResult = iface.decodeFunctionResult('listIdentitiesByRegulator', result.data);
        const count = Number(decodedResult[0]);
        const identities = decodedResult[1];
        return { result: { count, identities }, error: '' };
      } else {
        return { result: null, error: 'Error fetching identities list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching identities list: ' + error.message};
    }
  }  

//----------------------------------------------------------------------------------------------------------------------------------------

  async entityRegister(name: string, admin: string, password: string, metadata: string, apiAddress: string) {
    try {
      const { loginHash, secret } = await this.generateZKPData(admin, password);

      const userData = { name: 'Super Admin', email: '' };
      const encryptedUserData = await this.cryptoService.aesEncrypt(
        environment.aesKEY, 
        JSON.stringify(userData)
      );

      const contractInfo = await this.getContractAddress('EntitiesProxy');
      const contractAddress = contractInfo.result;
      const regulator = environment.regulatorAddress;

      // ✅ Local contract instance — never touches this.regulatorContract
      const apiSigner = new ethers.Wallet(environment.apiPrivKey, this.rpcProvider);
      const regulatorAsApi = new ethers.Contract(
        this.regulatorContractAddress,
        RegulatorTemplateAbi,
        apiSigner   // msg.sender will be apiAddress → passes onlyAuthorizedOrAPI
      );

      const iface = new ethers.Interface([
        "function entityCreate(string memory name, string memory metadata, uint256 countryCode, bytes32 adminHash, bytes32 adminSecret, string memory adminData, address apiAddress, address regulatorAddress) external returns (address entityAddress)"
      ]);

      const callData = iface.encodeFunctionData('entityCreate', [
        name, metadata, 818, loginHash, secret, encryptedUserData, apiAddress, regulator
      ]);

      // ✅ Direct call — no re-entrant connectRegulatorContract()
      const tx = await regulatorAsApi['callExternal'](contractAddress, callData, { gasLimit: 5000000 });
      const receipt = await tx.wait();

      if (receipt?.status === 1) {
        return { success: true, contract: receipt };
      }
      return { success: false, contract: '' };

    } catch (error) {
      console.error(error);
      return { success: false, contract: '' };
    }
  }

  async entityChangeState(address: string, state: number) {
    try {
      const iface = new ethers.Interface(["function setState(uint8 state) external returns (bool)"]);
      const callData = iface.encodeFunctionData('setState', [state]);
      const result = await this.callExternal(address, callData);
      if(result !== null) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error changing entity state'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error changing entity state: ' + error.message};
    }

  }

  async entitiesListAll(start: number, offset: number) {
    try {
      const contractInfo = await this.getContractAddress('EntitiesProxy');
      const contractAddress = contractInfo.result;
      const iface = new ethers.Interface([
        "function entitiesListByCountry(uint256 start, uint256 offset) external view returns (uint256 count, tuple(address entity, string name, string metadata, uint256 countryCode, address regulator, uint8 state)[] entities)"
      ]);
      
      const callData = iface.encodeFunctionData('entitiesListByCountry', [start, offset]);
      const result = await this.callExternalStatic(contractAddress, callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('entitiesListByCountry', result.data);
        const { count, entities } = await this.processEntitiesList(decodedResult);        
        return { result: { count, entities }, error: '' };
      } else {
        return { result: null, error: 'Error fetching entities list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching entities list: ' + error.message};
    }
  }

  async entitiesListOwn(start: number, offset: number) {
    try {
      const contractInfo = await this.getContractAddress('EntitiesProxy');
      const contractAddress = contractInfo.result;
      const iface = new ethers.Interface([
        "function entitiesListByRegulator(uint256 start, uint256 offset) external view returns (uint256 count, tuple(address entity, string name, string metadata, uint256 countryCode, address regulator, uint8 state)[] entities)"
      ]);
      
      const callData = iface.encodeFunctionData('entitiesListByRegulator', [start, offset]);
      const result = await this.callExternalStatic(contractAddress, callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('entitiesListByRegulator', result.data);
        const { count, entities } = await this.processEntitiesList(decodedResult);        
        return { result: { count, entities }, error: '' };
      } else {
        return { result: null, error: 'Error fetching entities list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching entities list: ' + error.message};
    }
  }  

  async entityInfo(entityAddress: string) {
    try {
      const iface = new ethers.Interface([
        "function info() external view returns (tuple(address entity, string name, string metadata, uint256 countryCode, address regulator, uint8 state))"
      ]);
      
      const callData = iface.encodeFunctionData('info');
      const result = await this.callExternalStatic(entityAddress, callData);
      if (result.success && result.data !== null) {
       
        const decodedResult = iface.decodeFunctionResult('info', result.data);
        const parsedData = JSON.parse(decodedResult[0][2]);

        // Fetch state names once
        await this.connectVariablesProxyContract();
        const statesResult = await this.getGlobalVariableByCategory('Account State');
        const stateId = Number(decodedResult[0][5]);
        let stateName = 'Unknown';
        if (statesResult.result) {
          const stateVariable = statesResult.result.find((v: any) => v.variableId === stateId);
          stateName = stateVariable?.name || 'Unknown';
        }

        // get country name
        const countryCode = Number(decodedResult[0][3]);
        let countryName = 'Unknown';
        if (this.countriesList.length === 0) {
          await this.getCountriesList();
        }
        const country = this.countriesList.find(c => c.countryCode === countryCode);
        countryName = country?.nameShort || 'Unknown';        

        // get regulator name
        const regulatorAddress = decodedResult[0][4];
        let regulatorName = 'Unknown';
        let regulatorSymbol = 'Unknown';
        const regulatorsResult = await this.regulatorInfo(regulatorAddress);
        const regulator = regulatorsResult.result?.regulator;
        regulatorName = regulator?.name || 'Unknown';
        regulatorSymbol = regulator?.symbol || 'Unknown';

        const entity: Entity = {
          address: decodedResult[0][0],
          name: decodedResult[0][1],
          metadata: decodedResult[0][2],
          email: parsedData.email,
          mobile: parsedData.mobile,
          website: parsedData.website,
          countryCode: countryCode,
          countryName,
          regulator: regulatorAddress,
          regulatorName,
          regulatorSymbol,
          state: stateId,
          stateName
        };


        return { result: { entity }, error: '' };
      } else {
        return { result: null, error: 'Error fetching entity info' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching entity info: ' + error.message};
    }
  }

  async processEntitiesList(data: any) {
    // Fetch state names once for all validators
    await this.connectVariablesProxyContract();
    const statesResult = await this.getGlobalVariableByCategory('Account State');

    // check countries list
    if (this.countriesList.length === 0) {
      await this.getCountriesList();
    }
        
    const count = Number(data[0]);
    const entities = await Promise.all(
      data[1].map(async (op: any) => {
        let parsedData = null;
        try {
          parsedData = JSON.parse(op.metadata);
        } catch (e) {
          console.error('Error parsing operator data:', e);
        }

        // Get state name for this validator
        const stateId = Number(op.state);
        let stateName = 'Unknown';
        if (statesResult.result) {
          const stateVariable = statesResult.result.find((v: any) => v.variableId === stateId);
          stateName = stateVariable?.name || 'Unknown';
        }  

        // Get country name for this operator
        const countryCode = Number(op.countryCode);
        const country = this.countriesList.find(c => c.countryCode === countryCode);
        const countryName = country?.nameShort || 'Unknown';
        
        // get regulator name
        const regulatorAddress = op.regulator;
        let regulatorName = 'Unknown';
        let regulatorSymbol = 'Unknown';
        const regulatorsResult = await this.regulatorInfo(regulatorAddress);
        const regulator = regulatorsResult.result?.regulator;
        regulatorName = regulator?.name || 'Unknown';
        regulatorSymbol = regulator?.symbol || 'Unknown';


        return {
          address: op.entity,
          name: op.name,
          data: op.metadata,
          email: parsedData?.email || '',
          mobile: parsedData?.mobile || '',
          website: parsedData?.website || '',
          countryCode: Number(op.countryCode),
          countryName,
          regulator: op.regulator,
          regulatorName,
          regulatorSymbol,
          state: stateId,
          stateName
        };
      })
    )

    entities.sort((a: any, b: any) => a.name.localeCompare(b.name));
    
    return { count, entities };    

  }

//----------------------------------------------------------------------------------------------------------------------------------------

  async serviceChangeName(address: string, name: string) {
    try {
      const iface = new ethers.Interface(["function overrideName(string memory name) external returns (bool)"]);
      const callData = iface.encodeFunctionData('overrideName', [name]);
      const result = await this.callExternal(address, callData);
      if(result !== null) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error changing service data'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error changing service data: ' + error.message};
    }

  }   

  async serviceChangeData(address: string, data: string) {
    try {
      const iface = new ethers.Interface(["function overrideData(string memory data) external returns (bool)"]);
      const callData = iface.encodeFunctionData('overrideData', [data]);
      const result = await this.callExternal(address, callData);
      if(result !== null) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error changing service data'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error changing service data: ' + error.message};
    }

  }  
  
  async serviceChangeState(address: string, state: number) {
    try {
      const iface = new ethers.Interface(["function overrideState(uint8 state) external returns (bool)"]);
      const callData = iface.encodeFunctionData('overrideState', [state]);
      const result = await this.callExternal(address, callData);
      if(result !== null) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error changing service state'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error changing service state: ' + error.message};
    }

  }

  async servicesListAll(start: number, offset: number) {
    try {
      if(!this.serviceAddress()) await this.getContractAddress('EntitiesProxy');
      const iface = new ethers.Interface([
        "function servicesListByCountry(uint256 countryCode, uint256 start, uint256 offset) external view returns (uint256 count, tuple(address service, string name, string data, uint256 countryCode, uint8 verificationLevel, address regulator, address validator, uint8 state)[] services)"
      ]);
      
      const callData = iface.encodeFunctionData('servicesListByCountry', [818, start, offset]);
      const result = await this.callExternalStatic(this.serviceAddress(), callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('servicesListByCountry', result.data);
        const { count, services } = await this.processServicesList(decodedResult);        
        return { result: { count, services }, error: '' };
      } else {
        return { result: null, error: 'Error fetching services list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching services list: ' + error.message};
    }
  }

  async servicesListOwn(start: number, offset: number) {
    try {
      if(!this.serviceAddress()) await this.getContractAddress('EntitiesProxy');
      const iface = new ethers.Interface([
        "function servicesListByRegulator(uint256 start, uint256 offset) external view returns (uint256 count, tuple(address service, string name, string data, uint256 countryCode, uint8 verificationLevel, address regulator, address validator, uint8 state)[] services)"
      ]);
      
      const callData = iface.encodeFunctionData('servicesListByRegulator', [start, offset]);
      const result = await this.callExternalStatic(this.serviceAddress(), callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('servicesListByRegulator', result.data);
        const { count, services } = await this.processServicesList(decodedResult);        
        return { result: { count, services }, error: '' };
      } else {
        return { result: null, error: 'Error fetching services list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching services list: ' + error.message};
    }
  }  

  async serviceInfo(serviceAddress: string) {
    try {
      const iface = new ethers.Interface([
        "function info() external view returns (tuple(address service, string name, string data, uint256 countryCode, uint8 verificationLevel, address regulator, address validator, uint8 state))"
      ]);
      
      const callData = iface.encodeFunctionData('info');
      const result = await this.callExternalStatic(serviceAddress, callData);
      if (result.success && result.data !== null) {
       
        const decodedResult = iface.decodeFunctionResult('info', result.data);
        const parsedData = JSON.parse(decodedResult[0][2]);

        // Fetch state names once
        await this.connectVariablesProxyContract();
        const statesResult = await this.getGlobalVariableByCategory('Account State');
        const stateId = Number(decodedResult[0][7]);
        let stateName = 'Unknown';
        if (statesResult.result) {
          const stateVariable = statesResult.result.find((v: any) => v.variableId === stateId);
          stateName = stateVariable?.name || 'Unknown';
        }

        const vLevel = await this.getGlobalVariableByCategory('Identity Verification Level');
        const vLevelId = Number(decodedResult[0][4]);
        let vLevelName = 'Unknown';
        if (vLevel.result) {
          const vLevelVariable = vLevel.result.find((v: any) => v.variableId === vLevelId);
          vLevelName = vLevelVariable?.name || 'Unknown';
        }

        // get country name
        const countryCode = Number(decodedResult[0][3]);
        let countryName = 'Unknown';
        if (this.countriesList.length === 0) {
          await this.getCountriesList();
        }
        const country = this.countriesList.find(c => c.countryCode === countryCode);
        countryName = country?.nameShort || 'Unknown';        

        // get regulator name
        const regulatorAddress = decodedResult[0][5];
        let regulatorName = 'Unknown';
        let regulatorSymbol = 'Unknown';
        const regulatorsResult = await this.regulatorInfo(regulatorAddress);
        const regulator = regulatorsResult.result?.regulator;
        regulatorName = regulator?.name || 'Unknown';
        regulatorSymbol = regulator?.symbol || 'Unknown';

        // get validator name
        const validatorAddress = decodedResult[0][6];
        let validatorName = 'Unknown';
        const validatorResult = await this.validatorInfo(validatorAddress);
        const validator = validatorResult.result?.validator;
        validatorName = validator?.name || 'Unknown';

        const service: Service = {
          address: decodedResult[0][0],
          regulator: regulatorAddress,
          regulatorName,
          regulatorSymbol,
          validator: validatorAddress,
          validatorName,
          verificationLevel: vLevelId,
          verificationLevelName: vLevelName,
          name: decodedResult[0][1],
          data: decodedResult[0][2],
          email: parsedData.email,
          mobile: parsedData.mobile,
          website: parsedData.website,
          countryCode: countryCode,
          countryName,
          state: stateId,
          stateName
        };


        return { result: { service }, error: '' };
      } else {
        return { result: null, error: 'Error fetching service info' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching service info: ' + error.message};
    }
  }

  async processServicesList(data: any) {
        // Fetch state names once for all validators
        await this.connectVariablesProxyContract();
        const statesResult = await this.getGlobalVariableByCategory('Account State');
        const vLevelResult = await this.getGlobalVariableByCategory('Identity Verification Level');

        // check countries list
        if (this.countriesList.length === 0) {
          await this.getCountriesList();
        }
        
        const count = Number(data[0]);
        const services = await Promise.all(
          data[1].map(async (op: any) => {
            // console.log('result', op);
            let parsedData = null;
            try {
              parsedData = JSON.parse(op.data);
            } catch (e) {
              console.error('Error parsing operator data:', e);
            }
  
            // Get state name for this validator
            const stateId = Number(op.state);
            let stateName = 'Unknown';
            if (statesResult.result) {
              const stateVariable = statesResult.result.find((v: any) => v.variableId === stateId);
              stateName = stateVariable?.name || 'Unknown';
            }  

            const vLevelId = Number(op.verificationLevel);
            let vLevelName = 'Unknown';
            if (vLevelResult.result) {
              const vLevelVariable = vLevelResult.result.find((v: any) => v.variableId === vLevelId);
              vLevelName = vLevelVariable?.name || 'Unknown';
            }            
  
            // Get country name for this operator
            const countryCode = Number(op.countryCode);
            const country = this.countriesList.find(c => c.countryCode === countryCode);
            const countryName = country?.nameShort || 'Unknown';
            
            // get regulator name
            const regulatorAddress = op.regulator;
            let regulatorName = 'Unknown';
            let regulatorSymbol = 'Unknown';
            const regulatorsResult = await this.regulatorInfo(regulatorAddress);
            const regulator = regulatorsResult.result?.regulator;
            regulatorName = regulator?.name || 'Unknown';
            regulatorSymbol = regulator?.symbol || 'Unknown';
  

            // get validator name
            const validatorAddress = op.validator;
            let validatorName = 'Unknown';
            const validatorResult = await this.validatorInfo(validatorAddress);
            const validator = validatorResult.result?.validator;
            validatorName = validator?.name || 'Unknown';

            return {
              address: op.service,
              name: op.name,
              data: op.data,
              email: parsedData?.email || '',
              mobile: parsedData?.mobile || '',
              website: parsedData?.website || '',
              countryCode: Number(op.countryCode),
              countryName,
              regulator: op.regulator,
              regulatorName,
              regulatorSymbol,
              validator: op.validator,
              validatorName,
              verificationLevel: vLevelId,
              verificationLevelName: vLevelName,
              state: stateId,
              stateName
            };
          })
        )

        services.sort((a: any, b: any) => a.name.localeCompare(b.name));
        
        return { count, services };    
  }

//----------------------------------------------------------------------------------------------------------------------------------------

  async subscriptionChangeState(address: string, state: number) {
    try {
      const iface = new ethers.Interface(["function overrideState(uint8 state) external returns (bool)"]);
      const callData = iface.encodeFunctionData('overrideState', [state]);
      const result = await this.callExternal(address, callData);
      if(result !== null) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error changing subscription state'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error changing subscription state: ' + error.message};
    }

  }

  async subscriptionSubscriber(subscription: string) {
    try {
      const contractAddress = await this.externalContractGet('subscriptions');
      const iface = new ethers.Interface([
        "function getSubscriber(address subscription) external view returns (bytes32)"
      ]);
      
      const callData = iface.encodeFunctionData('getSubscriber', [subscription]);
      const result = await this.callExternalStatic(contractAddress.result, callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('getSubscriber', result.data);
        const subscriber = decodedResult[0];
        return { result: subscriber, error: '' };
      } else {
        return { result: null, error: 'Error fetching subscriber' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching subscriber: ' + error.message};
    }
  }

  async subscriptionInfo(subscriptionAddress: string) {
    try {
      const contractAddress = await this.externalContractGet('subscriptions');
      const iface = new ethers.Interface([
        "function info(address subscription) external view returns (tuple(address subscription, address service, address validator, address regulator, uint256 createdAt, uint8 state) subscription)"
      ]);
      
      const callData = iface.encodeFunctionData('info', [subscriptionAddress]);
      const result = await this.callExternalStatic(contractAddress.result, callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('info', result.data);

        // Fetch state names once for all validators
        await this.connectVariablesProxyContract();
        const statesResult = await this.getGlobalVariableByCategory('Account State');

        // Get state name for this validator
        const stateId = Number(decodedResult[0][5]);
        let stateName = 'Unknown';
        if (statesResult.result) {
          const stateVariable = statesResult.result.find((v: any) => v.variableId === stateId);
          stateName = stateVariable?.name || 'Unknown';
        }
        
        // get regulator name
        const regulatorAddress = decodedResult[0][3];
        let regulatorName = 'Unknown';
        const regulatorsResult = await this.regulatorInfo(regulatorAddress);
        const regulator = regulatorsResult.result?.regulator;
        regulatorName = regulator?.name || 'Unknown';

        // get validator name
        const validatorAddress = decodedResult[0][2];
        let validatorName = 'Unknown';
        const validatorResult = await this.validatorInfo(validatorAddress);
        const validator = validatorResult.result?.validator;
        validatorName = validator?.name || 'Unknown';
        
        // get service name
        const serviceAddress = decodedResult[0][1];
        let serviceName = 'Unknown';
        const serviceResult = await this.serviceInfo(serviceAddress);
        const service = serviceResult.result?.service;
        serviceName = service?.name || 'Unknown';

        // get subscriber
        const subscriberResult = await this.subscriptionSubscriber(subscriptionAddress);
        const subscriber = subscriberResult.result;

        const subscription: Subscription = {
          subscription: decodedResult[0][0],
          subscriber,
          service: serviceAddress,
          serviceName,
          validator: validatorAddress,
          validatorName,
          regulator: regulatorAddress,
          regulatorName,  
          state: stateId,
          stateName,
          createdAt: Number(decodedResult[0][4])
        };

        return { result: subscription, error: '' };
      } else {
        return { result: null, error: 'Error fetching services list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching services list: ' + error.message};
    }
  }

  async subscriptionsListByRegulator(start: number, offset: number) {
    try {
      if(!this.subscriptionAddress()) await this.getContractAddress('EntitiesProxy');
      const iface = new ethers.Interface([
        "function listByRegulator(uint256 start, uint256 offset) external view returns (uint256 count, tuple(address subscription, address service, address validator, address regulator, uint256 createdAt, uint8 state)[] subscriptions)"
      ]);
      
      const callData = iface.encodeFunctionData('listByRegulator', [start, offset]);
      const result = await this.callExternalStatic(this.subscriptionAddress(), callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('listByRegulator', result.data);
        const { count, subscriptions } = await this.processSubscriptionsList(decodedResult);        
        return { result: { count, subscriptions }, error: '' };
      } else {
        return { result: null, error: 'Error fetching services list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching services list: ' + error.message};
    }
  }

  async subscribersListByService(service: string, start: number, offset: number) {
    try {
      if(!this.subscriptionAddress()) await this.getContractAddress('EntitiesProxy');
      const iface = new ethers.Interface([
        "function listByService(address service, uint256 start, uint256 offset) external view returns (uint256 count, tuple(address subscription, address service, address validator, address regulator, uint256 createdAt, uint8 state)[] subscriptions)"
      ]);
      
      const callData = iface.encodeFunctionData('listByService', [service, start, offset]);
      const result = await this.callExternalStatic(this.subscriptionAddress(), callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('listByService', result.data);
        const { count, subscriptions } = await this.processSubscriptionsList(decodedResult);        
        return { result: { count, subscriptions }, error: '' };
      } else {
        return { result: null, error: 'Error fetching services list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching services list: ' + error.message};
    }
  }

  async subscribersListByValidator(validator: string, start: number, offset: number) {
    try {
      const result = await this.regulatorContract.subscribersListByValidator(validator, start, offset);
      if (result) {
        const { count, subscriptions } = await this.processSubscriptionsList(result);        
        return { result: { count, subscriptions }, error: '' };
      } else {
        return { result: null, error: 'Error fetching services list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching services list: ' + error.message};
    }
  }

  async subscribersListByIdentity(identity: string, start: number, offset: number) {
    try {
      if(!this.subscriptionAddress()) await this.getContractAddress('EntitiesProxy');
      const iface = new ethers.Interface([
        "function listByIdentity(bytes32 subscriber, uint256 start, uint256 offset) external view returns (uint256 count, tuple(address subscription, address service, address validator, address regulator, uint256 createdAt, uint8 state)[] subscriptions)"
      ]);
      
      const callData = iface.encodeFunctionData('listByIdentity', [identity, start, offset]);
      const result = await this.callExternalStatic(this.subscriptionAddress(), callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('listByIdentity', result.data);
        const { count, subscriptions } = await this.processSubscriptionsList(decodedResult);        
        return { result: { count, subscriptions }, error: '' };
      } else {
        return { result: null, error: 'Error fetching services list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching services list: ' + error.message};
    }
  }

  async processSubscriptionsList(data: any) {
    // Fetch state names once for all validators
    await this.connectVariablesProxyContract();
    const statesResult = await this.getGlobalVariableByCategory('Account State');

    // check countries list
    if (this.countriesList.length === 0) {
      await this.getCountriesList();
    }
    
    const count = Number(data[0]);
    
    // Fix: Use Promise.all to await all promises from map
    const subscriptions = await Promise.all(
      data[1].map(async (op: any) => {

        // Get state name for this validator
        const stateId = Number(op.state);
        let stateName = 'Unknown';
        if (statesResult.result) {
          const stateVariable = statesResult.result.find((v: any) => v.variableId === stateId);
          stateName = stateVariable?.name || 'Unknown';
        }  

        // get regulator name
        const regulatorAddress = op.regulator;
        let regulatorName = 'Unknown';
        const regulatorsResult = await this.regulatorInfo(regulatorAddress);
        const regulator = regulatorsResult.result?.regulator;
        regulatorName = regulator?.name || 'Unknown';

        // get validator name
        const validatorAddress = op.validator;
        let validatorName = 'Unknown';
        const validatorResult = await this.validatorInfo(validatorAddress);
        const validator = validatorResult.result?.validator;
        validatorName = validator?.name || 'Unknown';
        
        // get service name
        const serviceAddress = op.service;
        let serviceName = 'Unknown';
        const serviceResult = await this.serviceInfo(serviceAddress);
        const service = serviceResult.result?.service;
        serviceName = service?.name || 'Unknown';

        return {
          subscription: op.subscription,
          subscriber: '',
          service: op.service,
          serviceName,
          validator: op.validator,
          validatorName,
          regulator: op.regulator,
          regulatorName,
          state: Number(op.state),
          stateName,
          createdAt: Number(op.createdAt)
        };
      })
    );

    subscriptions.sort((a: any, b: any) => b.createdAt - a.createdAt);
    
    return { count, subscriptions };    
  }

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async identityContactCheck(contact: string) {
    try {
      // Generate SHA-256 hash and convert to bytes32
      const hashHex = '0x' + await this.cryptoService.shaHash(contact);
      console.log('hashHex', hashHex);
      const contactHash = ethers.zeroPadValue(hashHex, 32);
      console.log('contactHash', contactHash);
      
      const result = await this.regulatorContract.identityCheckContact(contactHash);
      console.log('result', result);
      return { result , error: ''};
    }
    catch (error: any) {
      console.log('error', error);
        return { result: null, error: 'Error checking contact'};
    }
  }

  async identityLookupByGIN(ginHash: string) {
    try {
      if(!this.operatorAddress()) await this.getContractAddress('IdentitiesProxy');
      const iface = new ethers.Interface([
        "function identityLookupByGIN(bytes32 ginHash) external view returns (tuple(address identity, bytes32 ginHash, string metadata, uint256 countryCode, uint256 createdAt, address createdBy, uint256 lastVarifiedAt, address lastVarifiedBy))"
      ]);

      const callData = iface.encodeFunctionData('identityLookupByGIN', [ginHash]);
      const result = await this.callExternalStatic(this.operatorAddress(), callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('identityLookupByGIN', result.data);      

        if (decodedResult[0][0] !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          const identity = await this.processIdentityData(decodedResult[0]);
          return { result: identity, error: '' };
        }
        else {
          return { result: null, error: 'Error fetching identity info' };
        }
      }
      else {
        return { result: null, error: 'Error fetching identity info' };
      }
    }
    catch (error: any) {
      console.log('error', error);
      return { result: null, error: 'Error fetching identity info: ' + error.message};
    }
  }    

  async identityLookupByUID(uid: string) {
    try {
      if(!this.operatorAddress()) await this.getContractAddress('IdentitiesProxy');
      const iface = new ethers.Interface([
        "function identityLookupByUniqueId(bytes32 uniqueIdHash) external view returns (tuple(address identity, bytes32 ginHash, string metadata, uint256 countryCode, uint256 createdAt, address createdBy, uint256 lastVarifiedAt, address lastVarifiedBy))"
      ]);

      const callData = iface.encodeFunctionData('identityLookupByUniqueId', [uid]);
      const result = await this.callExternalStatic(this.operatorAddress(), callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('identityLookupByUniqueId', result.data);      
        console.log('result', decodedResult[0][0]);

        if (decodedResult[0][0] !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          const identity = await this.processIdentityData(decodedResult[0]);
          return { result: identity, error: '' };
        }
        else {
          return { result: null, error: 'Error fetching identity info' };
        }
      }
      else {
        return { result: null, error: 'Error fetching identity info' };
      }
    }
    catch (error: any) {
      console.log('error', error);
      return { result: null, error: 'Error fetching identity info: ' + error.message};
    }
  }

  async identityLookupByContact(contact: string) {
    try {
      if(!this.operatorAddress()) await this.getContractAddress('IdentitiesProxy');
      const contactBytes32 = await this.stringToBytes32(contact);
      const iface = new ethers.Interface([
        "function identityLookupByContact(bytes32 contact) external view returns (tuple(address identity, bytes32 ginHash, string metadata, uint256 countryCode, uint256 createdAt, address createdBy, uint256 lastVarifiedAt, address lastVarifiedBy))"
      ]);

      const callData = iface.encodeFunctionData('identityLookupByContact', [contactBytes32]);
      const result = await this.callExternalStatic(this.operatorAddress(), callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('identityLookupByContact', result.data);      
        console.log('result', decodedResult[0][0]);

        if (decodedResult[0][0] !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          const identity = await this.processIdentityData(decodedResult[0]);
          return { result: identity, error: '' };
        }
        else {
          return { result: null, error: 'Error fetching identity info' };
        }
      }
      else {
        return { result: null, error: 'Error fetching identity info' };
      }
    }
    catch (error: any) {
      console.log('error', error);
      return { result: null, error: 'Error fetching identity info: ' + error.message};
    }
  }   

  async processIdentityData(data: any) {
    // check countries list
    if (this.countriesList.length === 0) {
      await this.connectVariablesProxyContract();
      await this.getCountriesList();
    }       

    // Get country name for this validator
    const countryCode = Number(data[3]);
    const country = this.countriesList.find(c => c.countryCode === countryCode);
    const countryName = country?.nameShort || 'Unknown';

    // get operator name
    const operatorAddress = data[5];
    let operatorName = 'Unknown';
    const operatorResult = await this.operatorInfo(operatorAddress);
    const operator = operatorResult.result?.operator;
    operatorName = operator?.name || 'Unknown';

    // get validator name
    const validatorAddress = data[7];
    let validatorName = 'Unknown';
    const validatorResult = await this.validatorInfo(validatorAddress);
    const validator = validatorResult.result?.validator;
    validatorName = validator?.name || 'Unknown';


    const identity: Identity = {
      address: data[0],
      ginHash: data[1],
      metadata: data[2],
      countryCode,
      countryName,
      createdAt: Number(data[4]),
      createdBy: operatorAddress,
      createdByName: operatorName,
      lastVarifiedAt: Number(data[6]),
      lastVarifiedBy: validatorAddress,
      lastVarifiedByName: validatorName
    };

    return identity;
  }

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async assetInfo(assetAddress: string) {
    try {
      const iface = new ethers.Interface([
        "function info() external view returns (tuple(address asset, string name, string symbol, uint8 tokenType, uint8 assetType, string metadata, uint256 totalSupply, uint256 circulating, uint256 currencyCode, uint256 createdOn, address issuer, address manager, address regulator, bool suspended, uint8 state) asset)"
      ]);
      
      const callData = iface.encodeFunctionData('info');
      const result = await this.callExternalStatic(assetAddress, callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('info', result.data);

        // Fetch state names once for all validators
        await this.connectVariablesProxyContract();
        const statesResult = await this.getGlobalVariableByCategory('Asset State');
        const tokenTypeResult = await this.getGlobalVariableByCategory('Asset Token Type');
        const assetTypeResult = await this.getGlobalVariableByCategory('Asset Type');

        // Get state name for this validator
        const stateId = Number(decodedResult[0][14]);
        let stateName = 'Unknown';
        if (statesResult.result) {
          const stateVariable = statesResult.result.find((v: any) => v.variableId === stateId);
          stateName = stateVariable?.name || 'Unknown';
        }
        
        const tokenTypeId = Number(decodedResult[0][3]);
        let tokenTypeName = 'Unknown';
        if (tokenTypeResult.result) {
          const tokenTypeVariable = tokenTypeResult.result.find((v: any) => v.variableId === tokenTypeId);
          tokenTypeName = tokenTypeVariable?.name || 'Unknown';
        }  

        const assetTypeId = Number(decodedResult[0][4]);
        let assetTypeName = 'Unknown';
        if (assetTypeResult.result) {
          const assetTypeVariable = assetTypeResult.result.find((v: any) => v.variableId === assetTypeId);
          assetTypeName = assetTypeVariable?.name || 'Unknown';
        }  

        // Get country name for this operator
        if (this.countriesList.length === 0) {
          await this.getCountriesList();
        }        
        const countryCode = Number(decodedResult[0][8]);
        const country = this.countriesList.find(c => c.countryCode === countryCode);
        const countryName = country?.nameShort || 'Unknown';
        const currencyCode = country?.currencyCode || 'Unknown';
        const currencyName = country?.currencyName || 'Unknown';
        
        // get regulator name
        const regulatorAddress = decodedResult[0][12];
        let regulatorName = 'Unknown';
        let regulatorSymbol = 'Unknown';
        const regulatorsResult = await this.regulatorInfo(regulatorAddress);
        const regulator = regulatorsResult.result?.regulator;
        regulatorName = regulator?.name || 'Unknown';
        regulatorSymbol = regulator?.symbol || 'Unknown';

        // get issuer name
        const issuerAddress = decodedResult[0][10];
        let issuerName = 'Unknown';
        const issuerResult = await this.serviceInfo(issuerAddress);
        const issuer = issuerResult.result?.service;
        issuerName = issuer?.name || 'Unknown';

        // get manager name
        const managerAddress = decodedResult[0][11];
        let managerName = 'Unknown';
        const managerResult = await this.serviceInfo(managerAddress);
        const manager = managerResult.result?.service;
        managerName = manager?.name || 'Unknown';

        const asset: Asset = {
          address: decodedResult[0][0],
          name: decodedResult[0][1],
          symbol: decodedResult[0][2],
          tokenType: tokenTypeId,
          tokenTypeName,
          assetType: assetTypeId,
          assetTypeName,
          metadata: decodedResult[0][5],
          totalSupply: Number(decodedResult[0][6]),
          circulating: Number(decodedResult[0][7]),
          countryCode: countryCode,
          countryName,
          currencyCode,
          currencyName,
          createdOn: Number(decodedResult[0][9]),
          issuer: issuerAddress,
          issuerName,
          manager: managerAddress,
          managerName,
          regulator: regulatorAddress,
          regulatorName,
          regulatorSymbol,
          suspended: decodedResult[0][13],
          state: stateId,
          stateName
        };

        return { result: { asset }, error: '' };
      } else {
        return { result: null, error: 'Error fetching services list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching services list: ' + error.message};
    }
  }

  async assetsListByIssuer(issuer: string, start: number, offset: number) {
    try {
      if(!this.assetsProxyAddress()) await this.getContractAddress('AssetsProxy');
      const iface = new ethers.Interface([
        "function getIssuerAssets(address issuer, uint256 start, uint256 offset) external view returns (uint256 count, tuple(address asset, string name, string symbol, uint8 tokenType, uint8 assetType, string metadata, uint256 totalSupply, uint256 circulating, uint256 currencyCode, uint256 createdOn, address issuer, address manager, address regulator, bool suspended, uint8 state)[] assets)"
      ]);
      
      const callData = iface.encodeFunctionData('getIssuerAssets', [issuer, start, offset]);
      const result = await this.callExternalStatic(this.assetsProxyAddress(), callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('getIssuerAssets', result.data);
        const { count, assets } = await this.processAssetsList(decodedResult);        
        return { result: { count, assets }, error: '' };
      } else {
        return { result: null, error: 'Error fetching assets list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list: ' + error.message};
    }
  }

  async assetsListByRegulator(start: number, offset: number) {
    try {
      if(!this.assetsProxyAddress()) await this.getContractAddress('AssetsProxy');
      const iface = new ethers.Interface([
        "function getRegulatorAssets(uint256 start, uint256 offset) external view returns (uint256 count, tuple(address asset, string name, string symbol, uint8 tokenType, uint8 assetType, string metadata, uint256 totalSupply, uint256 circulating, uint256 currencyCode, uint256 createdOn, address issuer, address manager, address regulator, bool suspended, uint8 state)[] assets)"
      ]);
      const callData = iface.encodeFunctionData('getRegulatorAssets', [start, offset]);
      const result = await this.callExternalStatic(this.assetsProxyAddress(), callData);
      console.log(result)
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('getRegulatorAssets', result.data);
        const { count, assets } = await this.processAssetsList(decodedResult);        
        return { result: { count, assets }, error: '' };
      } else {
        return { result: null, error: 'Error fetching assets list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list: ' + error.message};
    }
  }

  async assetsListByCountry(start: number, offset: number) {
    try {
      if(!this.assetsProxyAddress()) await this.getContractAddress('AssetsProxy');
      const iface = new ethers.Interface([
        "function getCountryAssets(uint256 start, uint256 offset) external view returns (uint256 count, tuple(address asset, string name, string symbol, uint8 tokenType, uint8 assetType, string metadata, uint256 totalSupply, uint256 circulating, uint256 currencyCode, uint256 createdOn, address issuer, address manager, address regulator, bool suspended, uint8 state)[] assets)"
      ]);
      const callData = iface.encodeFunctionData('getCountryAssets', [start, offset]);
      const result = await this.callExternalStatic(this.assetsProxyAddress(), callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('getCountryAssets', result.data);
        const { count, assets } = await this.processAssetsList(decodedResult);        
        return { result: { count, assets }, error: '' };
      } else {
        return { result: null, error: 'Error fetching assets list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list: ' + error.message};
    }
  }

  async processAssetsList(data: any) {
        // Fetch state names once for all validators
        await this.connectVariablesProxyContract();
        const statesResult = await this.getGlobalVariableByCategory('Asset State');
        const tokenTypeResult = await this.getGlobalVariableByCategory('Asset Token Type');
        const assetTypeResult = await this.getGlobalVariableByCategory('Asset Type');

        // check countries list
        if (this.countriesList.length === 0) {
          await this.getCountriesList();
        }
        
        const count = Number(data[0]);
        const assets = await Promise.all(
          data[1].map(async (op: any) => {
            // console.log('result', op);
            let parsedData = null;
            try {
              parsedData = JSON.parse(op.metadata);
            } catch (e) {
              console.error('Error parsing operator data:', e);
            }
  
            const stateId = Number(op.state);
            let stateName = 'Unknown';
            if (statesResult.result) {
              const stateVariable = statesResult.result.find((v: any) => v.variableId === stateId);
              stateName = stateVariable?.name || 'Unknown';
            }  

            const tokenTypeId = Number(op.tokenType);
            let tokenTypeName = 'Unknown';
            if (tokenTypeResult.result) {
              const tokenTypeVariable = tokenTypeResult.result.find((v: any) => v.variableId === tokenTypeId);
              tokenTypeName = tokenTypeVariable?.name || 'Unknown';
            }  
  
            const assetTypeId = Number(op.assetType);
            let assetTypeName = 'Unknown';
            if (assetTypeResult.result) {
              const assetTypeVariable = assetTypeResult.result.find((v: any) => v.variableId === assetTypeId);
              assetTypeName = assetTypeVariable?.name || 'Unknown';
            }  

            // Get country name for this operator
            const countryCode = Number(op.currencyCode);
            const country = this.countriesList.find(c => c.countryCode === countryCode);
            const countryName = country?.nameShort || 'Unknown';
            const currencyCode = country?.currencyCode || 'Unknown';
            const currencyName = country?.currencyName || 'Unknown';
            
            // get regulator name
            const regulatorAddress = op.regulator;
            let regulatorName = 'Unknown';
            let regulatorSymbol = 'Unknown';
            const regulatorsResult = await this.regulatorInfo(regulatorAddress);
            const regulator = regulatorsResult.result?.regulator;
            regulatorName = regulator?.name || 'Unknown';
            regulatorSymbol = regulator?.symbol || 'Unknown';
  
            // get issuer name
            const issuerAddress = op.issuer;
            let issuerName = 'Unknown';
            const issuerResult = await this.serviceInfo(issuerAddress);
            const issuer = issuerResult.result?.service;
            issuerName = issuer?.name || 'Unknown';

            // get manager name
            const managerAddress = op.manager;
            let managerName = 'Unknown';
            const managerResult = await this.serviceInfo(managerAddress);
            const manager = managerResult.result?.service;
            managerName = manager?.name || 'Unknown';

            return {
              address: op.asset,
              name: op.name,
              symbol: op.symbol,
              tokenType: tokenTypeId,
              tokenTypeName,
              assetType: assetTypeId,
              assetTypeName,
              metadata: op.metadata,
              totalSupply: Number(op.totalSupply),
              circulating: Number(op.circulating),
              countryCode: countryCode,
              countryName,
              currencyCode,
              currencyName,
              createdOn: Number(op.createdOn),
              issuer: issuerAddress,
              issuerName,
              manager: managerAddress,
              managerName,
              regulator: regulatorAddress,
              regulatorName,
              regulatorSymbol,
              suspended: op.suspended,
              state: stateId,
              stateName
            };
          })
        )

        assets.sort((a: any, b: any) => a.name.localeCompare(b.name));
        
        return { count, assets };    
  }

  async assetChangeState(address: string, state: number) {
    try {
      const iface = new ethers.Interface(["function changeState(uint8 state) external returns (bool)"]);
      const callData = iface.encodeFunctionData('changeState', [state]);
      const result = await this.callExternal(address, callData);
      if(result !== null) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error changing asset state'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error changing asset state: ' + error.message};
    }
  }  

  async assetChangeSuspension(address: string, state: boolean) {
    try {
      console.log('state', state);
      const iface = new ethers.Interface(["function regulatorSuspend(bool suspend) external returns (bool)"]);
      const callData = iface.encodeFunctionData('regulatorSuspend', [state]);
      const result = await this.callExternal(address, callData);
      if(result !== null) {
        return { result, error: ''};
      }
      else {
        return { result: null, error: 'Error changing asset suspsension state'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error changing asset suspsension state: ' + error.message};
    }
  }   

  async assetPriceHistory(address: string, start: number, offset: number) {
    try {
      if(!this.assetsProxyAddress()) await this.getContractAddress('AssetsProxy');
      const iface = new ethers.Interface([
        "function getPriceHistory(uint256 start, uint256 offset) external view returns (uint256 count, tuple(uint256 bid, uint256 ask, uint256 timestamp)[] history)"
      ]);
      const callData = iface.encodeFunctionData('getPriceHistory', [start, offset]);
      const result = await this.callExternalStatic(address, callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('getPriceHistory', result.data);
        const count = decodedResult[0];
        const history = decodedResult[1].map((op: AssetPrice) => {
            return {
                bid: Number(ethers.formatEther(op.bid)),
                ask: Number(ethers.formatEther(op.ask)),
                timestamp: Number(op.timestamp)
            };
        });        
        return { result: { count, history }, error: '' };
      } else {
        return { result: null, error: 'Error fetching assets list' };
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list: ' + error.message};
    }
  }

  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Regulator Contract: API Functions
// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async validatorRegister(
    name: string,
    email: string, password: string, 
    metadata: string
  ) {

    try {

      // generate login data
      const { loginHash, secret } = await this.generateZKPData(email, password);
  
      // create & encrypt user data
      // const encryptedUserData = crypto.aesEncrypt(clientIp, process.env.ADMIN_KEY, JSON.stringify(metadata));
      const encryptedMetaata = metadata;

      const userData = {
        name: 'Super Admin',
        email: '',
      };
      const encryptedUserData = this.cryptoService.aesEncrypt(environment.aesKEY, JSON.stringify(userData));

      // create new wallet & connect to contract
      const privkey = environment.apiPrivKey;
      const apiSigner = new ethers.Wallet(privkey, this.rpcProvider);
      const apiContract = new ethers.Contract(this.regulatorContractAddress, RegulatorTemplateAbi, apiSigner);

      // register
      const tx = await apiContract['validatorAdd'](encryptedUserData, loginHash, secret, name, encryptedMetaata);
      const receipt = await tx.wait();
  
      // listen to contract event
      const eventlog = receipt.logs?.map((log: any) => apiContract.interface.parseLog(log))?.find((e: any) => e?.name === 'ValidatorEvent');
      if (eventlog) {
        const { sender, validator, action } = eventlog.args;
        // console.log(validator, action);
        return {
          success: true,
          contract: validator,
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

  async serviceRegister(
    name: string,
    admin: string, password: string, 
    metadata: string,
    vLevel: number,
    apiAddress: string
  ) {

    try {
      
      // generate login data
      const { loginHash, secret } = await this.generateZKPData(admin, password);
      // console.log('loginHash', loginHash);
      // console.log('secret', secret);
  
      // create & encrypt user data
      // const encryptedUserData = crypto.aesEncrypt(clientIp, process.env.ADMIN_KEY, JSON.stringify(metadata));
      const encryptedMetadata = metadata;

      const userData = {
        name: 'Super Admin',
        email: '',
      };
      const encryptedUserData = this.cryptoService.aesEncrypt(environment.aesKEY, JSON.stringify(userData));      

      // check if service proxy address is set
      if(!this.serviceAddress()) await this.getContractAddress('EntitiesProxy');

      const regulator = environment.regulatorAddress;
      const operator = '0x48aF7747D327663887b815590C8844f94AEaA4e4'; //this.operatorAddress();
      const addrZero = environment.addressZero;
      console.log('addr', regulator, operator, addrZero);

      const iface = new ethers.Interface([
        "function serviceCreate(string memory name, string memory data, uint8 verificationLevel, uint256 countryCode, bytes32 adminHash, bytes32 adminSecret, string memory adminData, address api, address regulator, address validator, address operator) external returns (address serviceAddress)"
      ]);

      const callData = iface.encodeFunctionData('serviceCreate', [name, encryptedMetadata, vLevel, 818, loginHash, secret, encryptedUserData, apiAddress, regulator, addrZero, this.operatorAddress()]);
      const result = await this.callExternal(this.serviceAddress(), callData);
      if (result.result) {
        console.log('decodedResult', result.result);
        return {success: true, contract: result.result};
      }
      else {
        return {success: false, contract: ''};
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

  async serviceRegister2(
    name: string,
    admin: string, password: string, 
    metadata: string,
    validatorAddress: string,
    vLevel: number
  ) {

    try {
      
      // generate login data
      const { loginHash, secret } = await this.generateZKPData(admin, password);
  
      // create & encrypt user data
      // const encryptedUserData = crypto.aesEncrypt(clientIp, process.env.ADMIN_KEY, JSON.stringify(metadata));
      const encryptedMetaata = metadata;

      const userData = {
        name: 'Super Admin',
        email: '',
      };
      const encryptedUserData = this.cryptoService.aesEncrypt(environment.aesKEY, JSON.stringify(userData));      

      // create new wallet & connect to contract
      const privkey = environment.apiPrivKey;
      const apiSigner = new ethers.Wallet(privkey, this.rpcProvider);
      const apiContract = new ethers.Contract(this.regulatorContractAddress, RegulatorTemplateAbi, apiSigner);

      // register
      const tx = await apiContract['serviceAdd'](encryptedUserData, loginHash, secret, name, encryptedMetaata, validatorAddress, vLevel);
      const receipt = await tx.wait();
  
      // listen to contract event
      const eventlog = receipt.logs?.map((log: any) => apiContract.interface.parseLog(log))?.find((e: any) => e?.name === 'ValidatorEvent');
      if (eventlog) {
        const { sender, validator, action } = eventlog.args;
        console.log(validator, action);
        return {
          success: true,
          contract: validator,
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

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Event Functions
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
      const accessFilter = this.regulatorContract.filters.AccessEvent();
      const credentialsFilter = this.regulatorContract.filters.CredentialEvent();
      const regulatorFilter = this.regulatorContract.filters.RegulatorEvent();
      const validatorFilter = this.regulatorContract.filters.ValidatorEvent();
      const serviceFilter = this.regulatorContract.filters.ServiceEvent();

      // Query all events
      const [accessEvents, credentialsEvents, regulatorEvents, validatorEvents, serviceEvents] = await Promise.all([
        this.regulatorContract.queryFilter(accessFilter, fromBlock, toBlock),
        this.regulatorContract.queryFilter(credentialsFilter, fromBlock, toBlock),
        this.regulatorContract.queryFilter(regulatorFilter, fromBlock, toBlock),
        this.regulatorContract.queryFilter(validatorFilter, fromBlock, toBlock),
        this.regulatorContract.queryFilter(serviceFilter, fromBlock, toBlock)
      ]);

      // Process all events with timestamps
      const allEvents = await Promise.all([
        ...accessEvents.map(async (event: any) => ({
          sender: event.args.account,
          eventType: 'Access',
          account: '',
          action: event.args.action,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          timestamp: (await this.rpcProvider.getBlock(event.blockNumber))?.timestamp || 0
        })),
        ...credentialsEvents.map(async (event: any) => ({
          sender: event.args.account,
          eventType: 'Credentials',
          account: '',
          action: event.args.action,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          timestamp: (await this.rpcProvider.getBlock(event.blockNumber))?.timestamp || 0
        })),
        ...regulatorEvents.map(async (event: any) => ({
          sender: event.args.sender,
          eventType: 'Regulator',
          account: '',
          action: event.args.action,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          timestamp: (await this.rpcProvider.getBlock(event.blockNumber))?.timestamp || 0
        })),
        ...validatorEvents.map(async (event: any) => ({
          sender: event.args.sender,
          eventType: 'Validator',
          account: event.args.validator,
          action: event.args.action,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          timestamp: (await this.rpcProvider.getBlock(event.blockNumber))?.timestamp || 0
        })),
        ...serviceEvents.map(async (event: any) => ({
          sender: event.args.sender,
          eventType: 'Service',
          account: event.args.validator,
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
