import { inject, Injectable, signal } from '@angular/core';
import { ethers } from 'ethers';
// @ts-ignore
import * as snarkjs from 'snarkjs';

import { environment } from '../../../environments/environment';

import GlobalVariablesAbi from '../../../assets/ABIs/GlobalVariablesProxy.json';
import RegulatorTemplateAbi from '../../../assets/ABIs/RegulatorTemplate.json';

// import AssetTemplateAbi from '../../../assets/ABIs/GARBasicTokenTemplate.json';

import { ControlEvent, Key, Regulator, RegulatorEvent, Country, GlobalVariable, Operator, Validator, Service, Identity, RegulatorData, Subscription, User } from '../models/data.model';

import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { CryptoService } from './crypto.service';

import { ParseProofUtils } from '../utils/parse-proof.utils';

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

  private authService = inject(AuthService);
  private storageService = inject(StorageService);
  private cryptoService = inject(CryptoService);

  mF = environment.multiplyFactor;
  key: Key = new Key('', '', '');
  
  globalSalt = environment.globalSalt;
  chainId = environment.chainId;

  rpcProvider = new ethers.JsonRpcProvider(environment.rpcNode);
  wsProvider = new ethers.WebSocketProvider(environment.wsNode);
  signer: any;
  
  globalVariablesContractAddress = environment.globalVariablesProxyContract
  globalVariablesContract: any;
  globalVariablesList: GlobalVariable[] = [];
  countriesList: Country[] = [];

  regulatorContractAddress = environment.regulatorAddress;
  regulatorContract: any;

  regulator!: Regulator;
  user!: User;

  assetContract: any;

  operatorAddress = signal<string>('');
  validatorAddress = signal<string>('');
  serviceAddress = signal<string>('');
  subscriptionAddress = signal<string>('');

  constructor() {}
  
  async init(){
    await this.createWallet();
    await this.connectRegulatorContract();
    await this.getContracts();
    await this.connectGlobalVariables();
    await this.getCountriesList();
    await this.getCategoriesList();
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
  
  async connectGlobalVariables() {
    try {
      this.globalVariablesContract = new ethers.Contract(this.globalVariablesContractAddress, GlobalVariablesAbi, this.signer);
    }
    catch (error: any) {
      
    }
  }

  async getCountriesList() {
    try {
      const result = await this.globalVariablesContract.countriesList();
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
      const result = await this.globalVariablesContract.variableCategoriesList();
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
      const result = await this.globalVariablesContract.variablesListByCategory(category);
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
      const result = await this.globalVariablesContract.sysvarById(category, id);
        return { result, error: ''};
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list'};
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

  async getContracts() {
    const operator = await this.externalContractGet('operator');
    this.operatorAddress.set(operator.result);
    const validators = await this.externalContractGet('validators');
    this.validatorAddress.set(validators.result);
    const services = await this.externalContractGet('services');
    this.serviceAddress.set(services.result);
    const subscriptions = await this.externalContractGet('subscriptions');
    this.subscriptionAddress.set(subscriptions.result);
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

        // get user info
        const userInfo = await this.userInfo(Number(userId));
        if(userInfo.result && userInfo.result.state === 2) {
          this.user = userInfo.result;
          this.storageService.set('contract', this.regulatorContractAddress);
          this.storageService.set('wallet', JSON.stringify(this.key));
          this.storageService.set('user', JSON.stringify(this.user));
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
          await this.connectGlobalVariables();
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
        await this.connectGlobalVariables();

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
        await this.connectGlobalVariables();

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
      console.log('result', result);
      if(result) {

        await this.connectGlobalVariables();

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
        await this.connectGlobalVariables();
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
      if(!this.validatorAddress()) await this.getContracts()
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
    await this.connectGlobalVariables();
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
        await this.connectGlobalVariables();
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
      if(!this.serviceAddress()) await this.getContracts()
      const iface = new ethers.Interface([
        "function listByCountry(uint256 countryCode, uint256 start, uint256 offset) external view returns (uint256 count, tuple(address service, address regulator, address validator, string name, string data, uint256 countryCode, uint8 state)[] services)"
      ]);
      
      const callData = iface.encodeFunctionData('listByCountry', [818, start, offset]);
      const result = await this.callExternalStatic(this.serviceAddress(), callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('listByCountry', result.data);

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
      if(!this.serviceAddress()) await this.getContracts()
      const iface = new ethers.Interface([
        "function listByRegulator(uint256 start, uint256 offset) external view returns (uint256 count, tuple(address service, address regulator, address validator, string name, string data, uint256 countryCode, uint8 state)[] services)"
      ]);
      
      const callData = iface.encodeFunctionData('listByRegulator', [start, offset]);
      const result = await this.callExternalStatic(this.serviceAddress(), callData);
      if (result.success && result.data !== null) {
        const decodedResult = iface.decodeFunctionResult('listByRegulator', result.data);
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
        "function info() external view returns (tuple(address service, address regulator, address validator, string name, string data, uint256 countryCode, uint8 state))"
      ]);
      
      const callData = iface.encodeFunctionData('info');
      const result = await this.callExternalStatic(serviceAddress, callData);
      if (result.success && result.data !== null) {
       
        const decodedResult = iface.decodeFunctionResult('info', result.data);
        const parsedData = JSON.parse(decodedResult[0][4]);

        // Fetch state names once
        await this.connectGlobalVariables();
        const statesResult = await this.getGlobalVariableByCategory('Account State');
        const stateId = Number(decodedResult[0][6]);
        let stateName = 'Unknown';
        if (statesResult.result) {
          const stateVariable = statesResult.result.find((v: any) => v.variableId === stateId);
          stateName = stateVariable?.name || 'Unknown';
        }

        // get country name
        const countryCode = Number(decodedResult[0][5]);
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

        // get validator name
        const validatorAddress = decodedResult[0][2];
        let validatorName = 'Unknown';
        const validatorResult = await this.validatorInfo(validatorAddress);
        const validator = validatorResult.result?.validator;
        validatorName = validator?.name || 'Unknown';

        const service: Service = {
          address: decodedResult[0][0],
          regulator: decodedResult[0][1],
          regulatorName,
          regulatorSymbol,
          validator: decodedResult[0][2],
          validatorName,
          name: decodedResult[0][3],
          data: decodedResult[0][4],
          email: parsedData.email,
          mobile: parsedData.mobile,
          website: parsedData.website,
          countryCode: Number(decodedResult[0][5]),
          countryName,
          state: Number(decodedResult[0][6]),
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
        await this.connectGlobalVariables();
        const statesResult = await this.getGlobalVariableByCategory('Account State');

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
              state: Number(op.state),
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
        await this.connectGlobalVariables();
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
      if(!this.subscriptionAddress()) await this.getContracts()
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
      if(!this.subscriptionAddress()) await this.getContracts()
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
      if(!this.subscriptionAddress()) await this.getContracts()
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
    await this.connectGlobalVariables();
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
      if(!this.operatorAddress()) await this.getContracts()
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
      if(!this.operatorAddress()) await this.getContracts()
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
      if(!this.operatorAddress()) await this.getContracts()
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
      await this.connectGlobalVariables();
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
      const encryptedUserData = metadata;

      // create new wallet & connect to contract
      const privkey = environment.apiPrivKey;
      const apiSigner = new ethers.Wallet(privkey, this.rpcProvider);
      const apiContract = new ethers.Contract(this.regulatorContractAddress, RegulatorTemplateAbi, apiSigner);

      // register
      const tx = await apiContract['validatorAdd'](loginHash, secret, name, encryptedUserData);
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
    email: string, password: string, 
    metadata: string,
    validatorAddress: string
  ) {

    try {
      
      // generate login data
      const { loginHash, secret } = await this.generateZKPData(email, password);
  
      // create & encrypt user data
      // const encryptedUserData = crypto.aesEncrypt(clientIp, process.env.ADMIN_KEY, JSON.stringify(metadata));
      const encryptedUserData = metadata;

      // create new wallet & connect to contract
      const privkey = environment.apiPrivKey;
      const apiSigner = new ethers.Wallet(privkey, this.rpcProvider);
      const apiContract = new ethers.Contract(this.regulatorContractAddress, RegulatorTemplateAbi, apiSigner);

      // register
      const tx = await apiContract['serviceAdd'](loginHash, secret, name, encryptedUserData, validatorAddress);
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
