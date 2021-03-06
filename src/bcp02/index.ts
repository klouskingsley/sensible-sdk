import { bsv, Bytes, toHex } from "scryptlib";
import { SatotxSigner, SignerConfig } from "../common/SatotxSigner";
import * as Utils from "../common/utils";
import { SigHashInfo, SigInfo } from "../common/utils";
import { API_NET, SensibleApi } from "../sensible-api";
import { FungibleToken, RouteCheckType, sighashType } from "./FungibleToken";
import * as SizeHelper from "./SizeHelper";
import * as TokenProto from "./tokenProto";
import * as TokenUtil from "./tokenUtil";
const $ = bsv.util.preconditions;
const _ = bsv.deps._;
const defaultSignerConfigs: SignerConfig[] = [
  {
    satotxApiPrefix: "https://api.satotx.com",
    satotxPubKey:
      "25108ec89eb96b99314619eb5b124f11f00307a833cda48f5ab1865a04d4cfa567095ea4dd47cdf5c7568cd8efa77805197a67943fe965b0a558216011c374aa06a7527b20b0ce9471e399fa752e8c8b72a12527768a9fc7092f1a7057c1a1514b59df4d154df0d5994ff3b386a04d819474efbd99fb10681db58b1bd857f6d5",
  },
  {
    satotxApiPrefix: "https://api.satotx.com",
    satotxPubKey:
      "25108ec89eb96b99314619eb5b124f11f00307a833cda48f5ab1865a04d4cfa567095ea4dd47cdf5c7568cd8efa77805197a67943fe965b0a558216011c374aa06a7527b20b0ce9471e399fa752e8c8b72a12527768a9fc7092f1a7057c1a1514b59df4d154df0d5994ff3b386a04d819474efbd99fb10681db58b1bd857f6d5",
  },
  {
    satotxApiPrefix: "https://api.satotx.com",
    satotxPubKey:
      "25108ec89eb96b99314619eb5b124f11f00307a833cda48f5ab1865a04d4cfa567095ea4dd47cdf5c7568cd8efa77805197a67943fe965b0a558216011c374aa06a7527b20b0ce9471e399fa752e8c8b72a12527768a9fc7092f1a7057c1a1514b59df4d154df0d5994ff3b386a04d819474efbd99fb10681db58b1bd857f6d5",
  },
];

const SIZE_OF_GENESIS_TOKEN = 4074;
const SIZE_OF_TOKEN = 7164;
const SIZE_OF_ROUTE_CHECK_TYPE_3To3 = 6362;
const SIZE_OF_ROUTE_CHECK_TYPE_6To6 = 10499;
const SIZE_OF_ROUTE_CHECK_TYPE_10To10 = 16015;
const SIZE_OF_ROUTE_CHECK_TYPE_3To100 = 52244;
const SIZE_OF_ROUTE_CHECK_TYPE_20To3 = 21765;
const BASE_UTXO_FEE = 1000;
const BASE_FEE = 52416;
const SIZE_OF_P2PKH = 106;

type ParamUtxo = {
  txId: string;
  outputIndex: number;
  satoshis: number;
  wif?: string;
  address?: any;
};

function checkParamUtxoFormat(utxo) {
  if (utxo) {
    if (!utxo.txId || !utxo.satoshis || !utxo.wif) {
      throw new Error(`UtxoFormatError-valid format example :{
				txId:'85f583e7a8e8b9cf86e265c2594c1e4eb45db389f6781c3b1ec9aa8e48976caa',
				satoshis:1000,
				outputIndex:1,
				wif:'L3J1A6Xyp7FSg9Vtj3iBKETyVpr6NibxUuLhw3uKpUWoZBLkK1hk'
			}`);
    }
  }
}

function checkParamSigners(signers) {
  if (signers.length != 3) {
    throw new Error("only support 3 signers");
  }
  let signer = signers[0];
  if (
    Utils.isNull(signer.satotxApiPrefix) ||
    Utils.isNull(signer.satotxPubKey)
  ) {
    throw new Error(`SignerFormatError-valid format example :
    signers:[{
			satotxApiPrefix: "https://api.satotx.com",
    	satotxPubKey:
      "25108ec89eb96b99314619eb5b124f11f00307a833cda48f5ab1865a04d4cfa567095ea4dd47cdf5c7568cd8efa77805197a67943fe965b0a558216011c374aa06a7527b20b0ce9471e399fa752e8c8b72a12527768a9fc7092f1a7057c1a1514b59df4d154df0d5994ff3b386a04d819474efbd99fb10681db58b1bd857f6d5",
		},...]`);
  }
}

function checkParamNetwork(network) {
  if (!["mainnet", "testnet"].includes(network)) {
    throw new Error(`NetworkFormatError:only support 'mainnet' and 'testnet'`);
  }
}

function checkParamGenesis(genesis) {
  $.checkArgument(
    _.isString(genesis),
    "Invalid Argument: genesis should be a string"
  );
  $.checkArgument(
    genesis.length == 72,
    `Invalid Argument: genesis.length must be 72`
  );
}

function checkParamCodehash(codehash) {
  $.checkArgument(
    _.isString(codehash),
    "Invalid Argument: codehash should be a string"
  );
  $.checkArgument(
    codehash.length == 40,
    `Invalid Argument: codehash.length must be 40`
  );
}

function checkParamReceivers(receivers) {
  const ErrorName = "ReceiversFormatError";
  if (Utils.isNull(receivers)) {
    throw new Error(`${ErrorName}: param should not be null`);
  }
  if (receivers.length > 0) {
    let receiver = receivers[0];
    if (Utils.isNull(receiver.address) || Utils.isNull(receiver.amount)) {
      throw new Error(`${ErrorName}-valid format example
      [
        {
          address: "mtjjuRuA84b2qVyo28AyJQ8AoUmpbWEqs3",
          amount: "1000",
        },
      ]
      `);
    }
  }
}

/**
 * ??????genesis???
 * @param txid
 * @param index
 * @returns
 */
function getGenesis(txid: string, index: number): string {
  const txidBuf = Buffer.from(txid, "hex").reverse();
  const indexBuf = Buffer.alloc(4, 0);
  indexBuf.writeUInt32LE(index);
  return toHex(Buffer.concat([txidBuf, indexBuf]));
}

/**
 * ??????genesis???
 * @param genesis
 * @returns
 */
function parseGenesis(genesis: string) {
  let tokenIDBuf = Buffer.from(genesis, "hex");
  let genesisTxId = tokenIDBuf.slice(0, 32).reverse().toString("hex");
  let genesisOutputIndex = tokenIDBuf.readUIntLE(32, 4);
  return {
    genesisTxId,
    genesisOutputIndex,
  };
}

/**
Sensible Fungible Token
???????????????????????????
 */
export class SensibleFT {
  private signers: SatotxSigner[];
  private feeb: number;
  private network: API_NET;
  private mock: boolean;
  private purse: string;
  private sensibleApi: SensibleApi;
  private zeroAddress: string;
  private ft: FungibleToken;
  private debug: boolean;
  private transferPart2?: any;
  /**
   *
   * @param signers - ?????????
   * @param feeb (??????)?????????????????????0.5
   * @param network (??????)???????????????mainnet/testnet?????????mainnet
   * @param purse (??????)????????????????????????wif????????????????????????genesis/issue/transfer?????????utxos
   * @param mock (??????)?????????genesis/issue/transfer?????????????????????????????????
   * @param debug (??????)???????????????????????????????????????verify???????????????
   */
  constructor({
    signers = defaultSignerConfigs,
    feeb = 0.5,
    network = API_NET.MAIN,
    mock = false,
    purse,
    debug = false,
  }: {
    signers: SignerConfig[];
    feeb?: number;
    network?: API_NET;
    mock?: boolean;
    purse?: string;
    debug?: boolean;
  }) {
    checkParamSigners(signers);
    checkParamNetwork(network);
    // checkParamApiTarget(apiTarget);
    this.signers = signers.map(
      (v) => new SatotxSigner(v.satotxApiPrefix, v.satotxPubKey)
    );
    this.feeb = feeb;
    this.network = network;
    this.mock = mock;
    this.sensibleApi = new SensibleApi(network);
    this.purse = purse;
    this.debug = debug;

    if (network == "mainnet") {
      this.zeroAddress = "1111111111111111111114oLvT2";
    } else {
      this.zeroAddress = "mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8";
    }

    this.ft = new FungibleToken(
      BigInt("0x" + signers[0].satotxPubKey),
      BigInt("0x" + signers[1].satotxPubKey),
      BigInt("0x" + signers[2].satotxPubKey)
    );
  }

  private async _pretreatUtxos(utxos: ParamUtxo[]) {
    let utxoPrivateKeys = [];
    if (utxos) {
      utxos.forEach((v) => {
        if (v.wif) {
          let privateKey = bsv.PrivateKey.fromWIF(v.wif);
          v.address = privateKey.toAddress(this.network);
          utxoPrivateKeys.push(privateKey);
        }
      });
    } else {
      const utxoPrivateKey = bsv.PrivateKey.fromWIF(this.purse);
      const utxoAddress = utxoPrivateKey.toAddress(this.network);
      utxos = await this.sensibleApi.getUnspents(utxoAddress.toString());
      utxos.forEach((utxo) => {
        utxo.address = utxoAddress;
      });
      utxoPrivateKeys = utxos.map((v) => utxoPrivateKey).filter((v) => v);
    }
    if (utxos.length == 0) throw new Error("Insufficient balance.");
    return { utxos, utxoPrivateKeys };
  }

  /**
   * ???????????????genesis??????,?????????
   * @param tokenName ????????????
   * @param tokenSymbol ????????????
   * @param decimalNum ????????????
   * @param utxos (??????)?????????utxo
   * @param changeAddress (??????)??????????????????
   * @param opreturnData (??????)????????????opReturn??????
   * @param genesisWif ????????????
   * @param noBroadcast (??????)????????????????????????false
   * @returns
   */
  public async genesis({
    tokenName,
    tokenSymbol,
    decimalNum,
    utxos,
    changeAddress,
    opreturnData,
    genesisWif,
    noBroadcast = false,
  }: {
    tokenName: string;
    tokenSymbol: string;
    decimalNum: number;
    utxos?: any;
    changeAddress?: any;
    opreturnData?: any;
    genesisWif: any;
    noBroadcast?: any;
  }): Promise<{
    txHex: string;
    txid: string;
    genesis: string;
    codehash: string;
    tx: any;
  }> {
    //validate params
    $.checkArgument(
      _.isString(tokenName),
      "Invalid Argument: tokenName should be a string"
    );
    $.checkArgument(
      Buffer.from(tokenName).length <= 20,
      `Invalid Argument: Buffer.from(tokenName).length must not be larger than 20`
    );
    $.checkArgument(
      _.isString(tokenSymbol),
      "Invalid Argument: tokenSymbol should be a string"
    );
    $.checkArgument(
      Buffer.from(tokenSymbol).length <= 10,
      `Invalid Argument:  Buffer.from(tokenSymbol).length must not be larger than 10`
    );
    $.checkArgument(
      _.isNumber(decimalNum),
      "Invalid Argument: decimalNum should be a number"
    );
    $.checkArgument(
      decimalNum >= 0 && decimalNum <= 255,
      `Invalid Argument:  decimalNum must be between 0 and 255`
    );
    $.checkArgument(genesisWif, "genesisWif is required");
    let utxoInfo = await this._pretreatUtxos(utxos);
    if (changeAddress) {
      changeAddress = new bsv.Address(changeAddress, this.network);
    } else {
      changeAddress = utxoInfo.utxos[0].address;
    }
    let genesisPrivateKey = new bsv.PrivateKey(genesisWif);
    let genesisPublicKey = genesisPrivateKey.toPublicKey();
    let { codehash, genesis, tx } = await this._genesis({
      tokenName,
      tokenSymbol,
      decimalNum,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress,
      opreturnData,
      genesisPublicKey,
    });

    let txHex = tx.serialize(true);
    if (!noBroadcast && !this.mock) {
      await this.sensibleApi.broadcast(txHex);
    }
    return { txHex, txid: tx.id, tx, codehash, genesis };
  }

  /**
   * ??????(????????????)genesis??????
   * @param tokenName ????????????
   * @param tokenSymbol ????????????
   * @param decimalNum ????????????
   * @param utxos (??????)?????????utxo
   * @param changeAddress (??????)??????????????????
   * @param opreturnData (??????)????????????opReturn??????
   * @param genesisPublicKey ????????????
   * @returns
   */
  public async unsignGenesis({
    tokenName,
    tokenSymbol,
    decimalNum,
    utxos,
    changeAddress,
    opreturnData,
    genesisPublicKey,
  }: {
    tokenName: string;
    tokenSymbol: string;
    decimalNum: number;
    utxos?: any;
    changeAddress?: any;
    opreturnData?: any;
    genesisPublicKey: any;
  }): Promise<{
    tx: any;
    sigHashList: SigHashInfo[];
  }> {
    //validate params
    $.checkArgument(
      _.isString(tokenName),
      "Invalid Argument: tokenName should be a string"
    );
    $.checkArgument(
      Buffer.from(tokenName).length <= 20,
      `Invalid Argument: Buffer.from(tokenName).length must not be larger than 20`
    );
    $.checkArgument(
      _.isString(tokenSymbol),
      "Invalid Argument: tokenSymbol should be a string"
    );
    $.checkArgument(
      Buffer.from(tokenSymbol).length <= 10,
      `Invalid Argument:  Buffer.from(tokenSymbol).length must not be larger than 10`
    );
    $.checkArgument(
      _.isNumber(decimalNum),
      "Invalid Argument: decimalNum should be a number"
    );
    $.checkArgument(
      decimalNum >= 0 && decimalNum <= 255,
      `Invalid Argument:  decimalNum must be between 0 and 255`
    );
    $.checkArgument(genesisPublicKey, "genesisPublicKey is required");
    let utxoInfo = await this._pretreatUtxos(utxos);
    if (changeAddress) {
      changeAddress = new bsv.Address(changeAddress, this.network);
    } else {
      changeAddress = utxoInfo.utxos[0].address;
    }
    genesisPublicKey = new bsv.PublicKey(genesisPublicKey);
    let { tx } = await this._genesis({
      tokenName,
      tokenSymbol,
      decimalNum,
      utxos: utxoInfo.utxos,
      changeAddress,
      opreturnData,
      genesisPublicKey,
    });

    let sigHashList: SigHashInfo[] = [];
    tx.inputs.forEach((input: any, inputIndex: number) => {
      let address = utxoInfo.utxos[inputIndex].address.toString();
      sigHashList.push({
        sighash: toHex(
          bsv.Transaction.sighash.sighash(
            tx,
            sighashType,
            inputIndex,
            input.output.script,
            input.output.satoshisBN
          )
        ),
        sighashType,
        address,
        inputIndex,
        isP2PKH: true,
      });
    });

    return { tx, sigHashList };
  }

  private async _genesis({
    tokenName,
    tokenSymbol,
    decimalNum,
    utxos,
    utxoPrivateKeys,
    changeAddress,
    opreturnData,
    genesisPublicKey,
  }: {
    tokenName: string;
    tokenSymbol: string;
    decimalNum: number;
    utxos?: any;
    utxoPrivateKeys?: any;
    changeAddress?: any;
    opreturnData?: any;
    genesisPublicKey: any;
  }) {
    //create genesis contract
    let genesisContract = this.ft.createGenesisContract(genesisPublicKey, {
      tokenName,
      tokenSymbol,
      decimalNum,
    });

    //create genesis tx
    let tx = this.ft.createGenesisTx({
      utxos,
      changeAddress,
      feeb: this.feeb,
      genesisContract,
      utxoPrivateKeys,
      opreturnData,
    });

    //calculate genesis/codehash
    let genesis, codehash;
    {
      let genesisTxId = tx.id;
      let genesisOutputIndex = 0;
      genesis = getGenesis(genesisTxId, genesisOutputIndex);
      let tokenContract = this.ft.createTokenContract(
        genesisTxId,
        genesisOutputIndex,
        genesisContract.lockingScript,
        {
          receiverAddress: new bsv.Address(this.zeroAddress), //dummy address
          tokenAmount: BigInt(0),
        }
      );
      codehash = Utils.getCodeHash(tokenContract.lockingScript);
    }

    //check fee enough
    const size = tx.toBuffer().length;
    const feePaid = tx._getUnspentValue();
    const feeRate = feePaid / size;
    if (feeRate < this.feeb) {
      throw new Error(
        `Insufficient balance.The fee rate should not be less than ${this.feeb}, but in the end it is ${feeRate}.`
      );
    }

    return { tx, genesis, codehash };
  }

  /**
   * ????????????????????????????????????
   * @param genesis ?????????genesis
   * @param codehash ?????????codehash
   * @param genesisWif ????????????
   * @param receiverAddress ????????????
   * @param tokenAmount ??????????????????
   * @param allowIncreaseIssues (??????)?????????????????????????????????
   * @param utxos (??????)??????utxos
   * @param changeAddress (??????)??????????????????
   * @param opreturnData (??????)????????????opReturn??????
   * @param noBroadcast (??????)??????????????????????????????false
   * @returns
   */
  public async issue({
    genesis,
    codehash,
    genesisWif,
    receiverAddress,
    tokenAmount,
    allowIncreaseIssues = true,
    utxos,
    changeAddress,
    opreturnData,
    noBroadcast = false,
  }: {
    genesis: string;
    codehash: string;
    genesisWif: string;
    receiverAddress: any;
    tokenAmount: string | bigint;
    allowIncreaseIssues: boolean;
    utxos?: any;
    changeAddress?: any;
    opreturnData?: any;
    noBroadcast?: boolean;
  }): Promise<{ txHex: string; txid: string; tx: any }> {
    checkParamGenesis(genesis);
    checkParamCodehash(codehash);
    $.checkArgument(genesisWif, "genesisWif is required");
    $.checkArgument(receiverAddress, "receiverAddress is required");
    $.checkArgument(tokenAmount, "tokenAmount is required");

    let utxoInfo = await this._pretreatUtxos(utxos);
    if (changeAddress) {
      changeAddress = new bsv.Address(changeAddress, this.network);
    } else {
      changeAddress = utxoInfo.utxos[0].address;
    }
    let genesisPrivateKey = new bsv.PrivateKey(genesisWif);
    let genesisPublicKey = genesisPrivateKey.toPublicKey();
    receiverAddress = new bsv.Address(receiverAddress, this.network);
    tokenAmount = BigInt(tokenAmount);
    let { tx } = await this._issue({
      genesis,
      codehash,
      receiverAddress,
      tokenAmount,
      allowIncreaseIssues,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress,
      opreturnData,
      genesisPrivateKey,
      genesisPublicKey,
    });

    let txHex = tx.serialize(true);
    if (!noBroadcast && !this.mock) {
      await this.sensibleApi.broadcast(txHex);
    }
    return { txHex, txid: tx.id, tx };
  }

  /**
   * ??????(????????????)?????????????????????
   * @param genesis ?????????genesis
   * @param codehash ?????????codehash
   * @param genesisPublicKey ????????????
   * @param receiverAddress ????????????
   * @param tokenAmount ??????????????????
   * @param allowIncreaseIssues (??????)?????????????????????????????????
   * @param utxos (??????)??????utxos
   * @param changeAddress (??????)??????????????????
   * @param opreturnData (??????)????????????opReturn??????
   * @returns
   */
  public async unsignIssue({
    genesis,
    codehash,
    genesisPublicKey,
    receiverAddress,
    tokenAmount,
    allowIncreaseIssues = true,
    utxos,
    changeAddress,
    opreturnData,
  }: {
    genesis: string;
    codehash: string;
    genesisPublicKey: any;
    receiverAddress: any;
    tokenAmount: string | bigint;
    allowIncreaseIssues?: boolean;
    utxos?: any;
    changeAddress?: any;
    opreturnData?: any;
  }): Promise<{ tx: any; sigHashList: SigHashInfo[] }> {
    checkParamGenesis(genesis);
    checkParamCodehash(codehash);
    $.checkArgument(genesisPublicKey, "genesisPublicKey is required");
    $.checkArgument(receiverAddress, "receiverAddress is required");
    $.checkArgument(tokenAmount, "tokenAmount is required");
    let utxoInfo = await this._pretreatUtxos(utxos);
    if (changeAddress) {
      changeAddress = new bsv.Address(changeAddress, this.network);
    } else {
      changeAddress = utxoInfo.utxos[0].address;
    }
    genesisPublicKey = new bsv.PublicKey(genesisPublicKey);
    receiverAddress = new bsv.Address(receiverAddress, this.network);
    tokenAmount = BigInt(tokenAmount);
    let { tx } = await this._issue({
      genesis,
      codehash,
      receiverAddress,
      tokenAmount,
      allowIncreaseIssues,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress,
      opreturnData,
      genesisPublicKey,
    });

    let sigHashList: SigHashInfo[] = [];
    tx.inputs.forEach((input: any, inputIndex: number) => {
      let address = "";
      let isP2PKH;
      if (inputIndex == 0) {
        address = genesisPublicKey.toAddress(this.network).toString();
        isP2PKH = false;
      } else {
        address = utxoInfo.utxos[inputIndex - 1].address.toString();
        isP2PKH = true;
      }
      sigHashList.push({
        sighash: toHex(
          bsv.Transaction.sighash.sighash(
            tx,
            sighashType,
            inputIndex,
            input.output.script,
            input.output.satoshisBN
          )
        ),
        sighashType,
        address,
        inputIndex,
        isP2PKH,
      });
    });

    return { tx, sigHashList };
  }

  private async _issue({
    genesis,
    codehash,
    receiverAddress,
    tokenAmount,
    allowIncreaseIssues = true,
    utxos,
    utxoPrivateKeys,
    changeAddress,
    opreturnData,
    genesisPrivateKey,
    genesisPublicKey,
  }: {
    genesis: string;
    codehash: string;
    receiverAddress: any;
    tokenAmount: bigint;
    allowIncreaseIssues: boolean;
    utxos?: any;
    utxoPrivateKeys?: any;
    changeAddress?: any;
    opreturnData?: any;
    noBroadcast?: boolean;
    genesisPrivateKey?: any;
    genesisPublicKey: any;
  }) {
    //??????????????????
    let genesisContract = this.ft.createGenesisContract(genesisPublicKey);
    let genesisContractCodehash = Utils.getCodeHash(
      genesisContract.lockingScript
    );

    //??????????????????UTXO
    let spendByTxId;
    let spendByOutputIndex;
    let { genesisTxId, genesisOutputIndex } = parseGenesis(genesis);
    let issueUtxos = await this.sensibleApi.getFungibleTokenUnspents(
      genesisContractCodehash,
      genesis,
      this.zeroAddress
    );
    if (issueUtxos.length > 0) {
      //???????????????
      spendByTxId = issueUtxos[0].txId;
      spendByOutputIndex = issueUtxos[0].outputIndex;
    } else {
      //????????????
      spendByTxId = genesisTxId;
      spendByOutputIndex = genesisOutputIndex;
    }
    //??????????????????????????????verify??????????????????
    //???????????????????????????
    //todo

    //???????????????????????????
    let spendByTxHex = await this.sensibleApi.getRawTxData(spendByTxId);
    const spendByTx = new bsv.Transaction(spendByTxHex);
    let preUtxoTxId = spendByTx.inputs[0].prevTxId.toString("hex"); //?????????????????????????????????????????????
    let preUtxoOutputIndex = spendByTx.inputs[0].outputIndex;
    let preUtxoTxHex = await this.sensibleApi.getRawTxData(preUtxoTxId);

    let balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0);
    if (balance == 0) throw new Error("Insufficient balance.");

    let estimateSatoshis = this.getIssueEstimateFee({
      opreturnData,
      allowIncreaseIssues,
    });
    if (balance < estimateSatoshis) {
      throw new Error(
        `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}.`
      );
    }

    //??????token??????
    const spendByLockingScript = spendByTx.outputs[spendByOutputIndex].script;
    let dataPartObj = TokenProto.parseDataPart(spendByLockingScript.toBuffer());
    const dataPart = TokenProto.newDataPart(dataPartObj);
    genesisContract.setDataPart(dataPart.toString("hex"));
    let tokenContract = this.ft.createTokenContract(
      genesisTxId,
      genesisOutputIndex,
      genesisContract.lockingScript,
      {
        receiverAddress,
        tokenAmount,
      }
    );

    //??????????????????
    let tx = await this.ft.createIssueTx({
      genesisContract,

      spendByTxId,
      spendByOutputIndex,
      spendByLockingScript,

      utxos,
      changeAddress,
      feeb: this.feeb,
      tokenContract,
      allowIncreaseIssues,
      satotxData: {
        index: preUtxoOutputIndex,
        txId: preUtxoTxId,
        txHex: preUtxoTxHex,
        byTxId: spendByTxId,
        byTxHex: spendByTxHex,
      },
      signers: this.signers,

      opreturnData,
      genesisPrivateKey,
      utxoPrivateKeys,
      debug: this.debug,
    });

    //?????????????????????????????????
    const size = tx.toBuffer().length;
    const feePaid = tx._getUnspentValue();
    const feeRate = feePaid / size;
    if (feeRate < this.feeb) {
      throw new Error(
        `Insufficient balance.The fee rate should not be less than ${this.feeb}, but in the end it is ${feeRate}.`
      );
    }
    return { tx };
  }

  private async supplyFtUtxosInfo(ftUtxos) {
    ftUtxos.forEach((v) => {
      v.tokenAmount = BigInt(v.tokenAmount);
    });

    let cachedHexs = {};
    //?????????????????????tx raw
    for (let i = 0; i < ftUtxos.length; i++) {
      let ftUtxo = ftUtxos[i];
      if (!cachedHexs[ftUtxo.txId]) {
        //??????????????????
        cachedHexs[ftUtxo.txId] = {
          waitingRes: this.sensibleApi.getRawTxData(ftUtxo.txId), //????????????
        };
      }
    }
    for (let id in cachedHexs) {
      //?????????????????????
      if (cachedHexs[id].waitingRes && !cachedHexs[id].hex) {
        cachedHexs[id].hex = await cachedHexs[id].waitingRes;
      }
    }
    ftUtxos.forEach((v) => {
      v.txHex = cachedHexs[v.txId].hex;
    });
    //????????????tx raw??????????????????
    for (let i = 0; i < ftUtxos.length; i++) {
      let ftUtxo = ftUtxos[i];
      const tx = new bsv.Transaction(ftUtxo.txHex);
      let preTxId = tx.inputs[0].prevTxId.toString("hex"); //?????????????????????????????????????????????
      let preOutputIndex = tx.inputs[0].outputIndex;
      ftUtxo.preTxId = preTxId;
      ftUtxo.preOutputIndex = preOutputIndex;
      if (!cachedHexs[preTxId]) {
        //??????????????????
        cachedHexs[preTxId] = {
          waitingRes: this.sensibleApi.getRawTxData(preTxId),
        }; //????????????
      }
    }
    for (let id in cachedHexs) {
      //?????????????????????
      if (cachedHexs[id].waitingRes && !cachedHexs[id].hex) {
        cachedHexs[id].hex = await cachedHexs[id].waitingRes;
      }
    }
    ftUtxos.forEach((v) => {
      v.preTxHex = cachedHexs[v.preTxId].hex;
      const tx = new bsv.Transaction(v.preTxHex);
      let dataPartObj = TokenProto.parseDataPart(
        tx.outputs[v.preOutputIndex].script.toBuffer()
      );
      v.preTokenAmount = dataPartObj.tokenAmount;
      if (
        dataPartObj.tokenAddress == "0000000000000000000000000000000000000000"
      ) {
        v.preTokenAddress = this.zeroAddress; //genesis ??????????????????preTokenAddress????????????????????????????????????????????? dummy
      } else {
        v.preTokenAddress = bsv.Address.fromPublicKeyHash(
          Buffer.from(dataPartObj.tokenAddress, "hex"),
          this.network
        ).toString();
      }
    });
    ftUtxos.forEach((v) => {
      v.preTokenAmount = BigInt(v.preTokenAmount);
    });

    return ftUtxos;
  }

  /**
   * ???????????????????????????
   * @param genesis ?????????genesis
   * @param codehash ?????????codehash
   * @param senderWif ??????????????????wif
   * @param receivers ????????????????????????[{address:'xxx',amount:'1000'}]
   * @param utxos (??????)??????utxos
   * @param changeAddress (??????)??????????????????
   * @param opreturnData (??????)????????????opReturn??????
   * @param noBroadcast (??????)??????????????????????????????false
   * @returns
   */
  public async transfer({
    codehash,
    genesis,
    senderWif,
    receivers,
    utxos,
    changeAddress,
    isMerge,
    opreturnData,
    noBroadcast = false,
  }: {
    codehash: string;
    genesis: string;
    senderWif: string;
    receivers?: any[];
    utxos?: any[];
    changeAddress?: any;
    isMerge?: boolean;
    opreturnData?: any;
    noBroadcast?: boolean;
  }): Promise<{
    tx: any;
    txHex: string;
    txid: string;
    routeCheckTx: any;
    routeCheckTxHex: string;
  }> {
    checkParamGenesis(genesis);
    checkParamCodehash(codehash);
    checkParamReceivers(receivers);
    $.checkArgument(senderWif, "senderWif is required");

    let utxoInfo = await this._pretreatUtxos(utxos);
    if (changeAddress) {
      changeAddress = new bsv.Address(changeAddress, this.network);
    } else {
      changeAddress = utxoInfo.utxos[0].address;
    }

    const senderPrivateKey = bsv.PrivateKey.fromWIF(senderWif);
    const senderPublicKey = senderPrivateKey.toPublicKey();

    let { tx, routeCheckTx } = await this._transfer({
      codehash,
      genesis,
      senderPrivateKey,
      senderPublicKey,
      receivers,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress,
      opreturnData,
      isMerge,
    });
    let routeCheckTxHex = routeCheckTx.serialize(true);
    let txHex = tx.serialize(true);

    if (!noBroadcast && !this.mock) {
      await this.sensibleApi.broadcast(routeCheckTxHex);
      await this.sensibleApi.broadcast(txHex);
    }

    return { tx, txHex, routeCheckTx, routeCheckTxHex, txid: tx.id };
  }

  /**
   * ??????(????????????)?????????????????????
   * @param genesis ?????????genesis
   * @param codehash ?????????codehash
   * @param senderPublicKey ??????????????????
   * @param receivers ????????????????????????[{address:'xxx',amount:'1000'}]
   * @param utxos (??????)??????utxos
   * @param changeAddress (??????)??????????????????
   * @param opreturnData (??????)????????????opReturn??????
   * @returns
   */
  public async unsignPreTransfer({
    codehash,
    genesis,
    senderPublicKey,
    receivers,
    utxos,
    changeAddress,
    isMerge,
    opreturnData,
  }: {
    codehash: string;
    genesis: string;
    senderPublicKey: any;
    receivers?: any[];
    utxos: any[];
    changeAddress: any;
    isMerge?: boolean;
    opreturnData?: any;
  }): Promise<{
    routeCheckTx: any;
    routeCheckSigHashList: SigHashInfo[];
  }> {
    checkParamGenesis(genesis);
    checkParamCodehash(codehash);
    checkParamReceivers(receivers);
    $.checkArgument(senderPublicKey, "senderPublicKey is required");

    let utxoInfo = await this._pretreatUtxos(utxos);
    if (changeAddress) {
      changeAddress = new bsv.Address(changeAddress, this.network);
    } else {
      changeAddress = utxoInfo.utxos[0].address;
    }

    senderPublicKey = new bsv.PublicKey(senderPublicKey);

    let { routeCheckTx } = await this._transfer({
      codehash,
      genesis,
      senderPublicKey,
      receivers,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress,
      opreturnData,
      isMerge,
    });

    let routeCheckSigHashList: SigHashInfo[] = [];
    routeCheckTx.inputs.forEach((input: any, inputIndex: number) => {
      let address = utxoInfo.utxos[inputIndex].address.toString();
      let isP2PKH = true;
      routeCheckSigHashList.push({
        sighash: toHex(
          bsv.Transaction.sighash.sighash(
            routeCheckTx,
            sighashType,
            inputIndex,
            input.output.script,
            input.output.satoshisBN
          )
        ),
        sighashType,
        address,
        inputIndex,
        isP2PKH,
      });
    });

    return {
      routeCheckTx,
      routeCheckSigHashList,
    };
  }

  private async _transfer({
    codehash,
    genesis,
    senderPrivateKey,
    senderPublicKey,
    receivers,
    utxos,
    utxoPrivateKeys,
    changeAddress,
    isMerge,
    opreturnData,
  }: {
    codehash: string;
    genesis: string;
    senderPrivateKey?: any;
    senderPublicKey?: any;
    receivers?: any[];
    utxos: any[];
    utxoPrivateKeys: any[];
    changeAddress: any;
    isMerge?: boolean;
    opreturnData?: any;
  }) {
    let balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0);
    if (balance == 0) {
      //????????????
      throw new Error("Insufficient balance.");
    }

    let senderAddress = senderPublicKey.toAddress(this.network);

    //???routeCheck?????????utxo??????transfer?????????utxo
    let changeAddress0 = utxos[0].address;
    let utxoPrivateKey0 = utxoPrivateKeys[0];

    //??????token???utxo
    let ftUtxos = await this.sensibleApi.getFungibleTokenUnspents(
      codehash,
      genesis,
      senderAddress.toString(),
      20
    );
    ftUtxos.forEach((v) => (v.tokenAmount = BigInt(v.tokenAmount)));

    let mergeUtxos = [];
    let mergeTokenAmountSum = BigInt(0);
    if (isMerge) {
      mergeUtxos = ftUtxos.slice(0, 20);
      mergeTokenAmountSum = mergeUtxos.reduce(
        (pre, cur) => pre + BigInt(cur.tokenAmount),
        BigInt(0)
      );
      receivers = [
        {
          address: senderAddress.toString(),
          amount: mergeTokenAmountSum,
        },
      ];
    }
    //??????????????????
    let tokenOutputArray = receivers.map((v) => ({
      address: new bsv.Address(v.address, this.network),
      tokenAmount: BigInt(v.amount),
    }));

    //????????????????????????
    let outputTokenAmountSum = tokenOutputArray.reduce(
      (pre, cur) => pre + cur.tokenAmount,
      BigInt(0)
    );

    //token???????????????
    let inputTokenAmountSum = BigInt(0);
    let _ftUtxos = [];
    for (let i = 0; i < ftUtxos.length; i++) {
      let ftUtxo = ftUtxos[i];
      _ftUtxos.push(ftUtxo);
      inputTokenAmountSum += ftUtxo.tokenAmount;
      if (i == 9 && inputTokenAmountSum >= outputTokenAmountSum) {
        //???????????????10To10
        break;
      }
      if (inputTokenAmountSum >= outputTokenAmountSum) {
        break;
      }
    }

    if (isMerge) {
      _ftUtxos = mergeUtxos;
      inputTokenAmountSum = mergeTokenAmountSum;
      if (mergeTokenAmountSum == BigInt(0)) {
        throw new Error("No utxos to merge.");
      }
    }

    ftUtxos = _ftUtxos;
    //??????ftUtxo?????????
    await this.supplyFtUtxosInfo(ftUtxos);

    if (inputTokenAmountSum < outputTokenAmountSum) {
      throw new Error(
        `insufficent token.Need ${outputTokenAmountSum} But only ${inputTokenAmountSum}`
      );
    }
    //??????????????????token??????
    let changeTokenAmount = inputTokenAmountSum - outputTokenAmountSum;
    if (changeTokenAmount > BigInt(0)) {
      tokenOutputArray.push({
        address: senderPublicKey.toAddress(this.network),
        tokenAmount: changeTokenAmount,
      });
    }

    //??????xTox???????????????
    let routeCheckType: RouteCheckType;
    let inputLength = ftUtxos.length;
    let outputLength = tokenOutputArray.length;
    let sizeOfRouteCheck = 0;
    if (inputLength <= 3) {
      if (outputLength <= 3) {
        routeCheckType = RouteCheckType.from3To3;
        sizeOfRouteCheck = SIZE_OF_ROUTE_CHECK_TYPE_3To3;
      } else if (outputLength <= 100) {
        routeCheckType = RouteCheckType.from3To100;
        sizeOfRouteCheck = SIZE_OF_ROUTE_CHECK_TYPE_3To100;
      } else {
        throw new Error(
          `unsupport transfer from inputs(${inputLength}) to outputs(${outputLength})`
        );
      }
    } else if (inputLength <= 6) {
      if (outputLength <= 6) {
        routeCheckType = RouteCheckType.from6To6;
        sizeOfRouteCheck = SIZE_OF_ROUTE_CHECK_TYPE_6To6;
      } else {
        throw new Error(
          `unsupport transfer from inputs(${inputLength}) to outputs(${outputLength})`
        );
      }
    } else if (inputLength <= 10) {
      if (outputLength <= 10) {
        routeCheckType = RouteCheckType.from10To10;
        sizeOfRouteCheck = SIZE_OF_ROUTE_CHECK_TYPE_10To10;
      } else {
        throw new Error(
          `unsupport transfer from inputs(${inputLength}) to outputs(${outputLength})`
        );
      }
    } else if (inputLength <= 20) {
      if (outputLength <= 3) {
        routeCheckType = RouteCheckType.from20To3;
        sizeOfRouteCheck = SIZE_OF_ROUTE_CHECK_TYPE_20To3;
      } else {
        throw new Error(
          `unsupport transfer from inputs(${inputLength}) to outputs(${outputLength})`
        );
      }
    } else {
      throw new Error("Too many token-utxos, should merge them to continue.");
    }

    let estimateSatoshis = this._calTransferSize({
      p2pkhInputNum: utxos.length,
      inputTokenNum: inputLength,
      outputTokenNum: outputLength,
      tokenLockingSize: SIZE_OF_TOKEN,
      routeCheckLockingSize: sizeOfRouteCheck,
      opreturnData,
    });
    if (balance < estimateSatoshis) {
      throw new Error(
        `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}.`
      );
    }

    const defaultFtUtxo = ftUtxos[0];
    const ftUtxoTx = new bsv.Transaction(defaultFtUtxo.txHex);
    const tokenLockingScript =
      ftUtxoTx.outputs[defaultFtUtxo.outputIndex].script;
    let dataPartObj = TokenProto.parseDataPart(tokenLockingScript.toBuffer());

    //create routeCheck contract
    let routeCheckContract = this.ft.createRouteCheckContract(
      routeCheckType,
      ftUtxos,
      tokenOutputArray,
      TokenProto.newTokenID(
        dataPartObj.tokenID.txid,
        dataPartObj.tokenID.index
      ),
      TokenProto.getContractCodeHash(tokenLockingScript.toBuffer())
    );

    //create routeCheck tx
    let routeCheckTx = this.ft.createRouteCheckTx({
      utxos,
      changeAddress,
      feeb: this.feeb,
      routeCheckContract,
      utxoPrivateKeys,
    });

    utxos = [
      {
        txId: routeCheckTx.id,
        satoshis:
          routeCheckTx.outputs[routeCheckTx.outputs.length - 1].satoshis,
        outputIndex: routeCheckTx.outputs.length - 1,
      },
    ];
    utxos.forEach((utxo) => {
      utxo.address = changeAddress0;
    });
    utxoPrivateKeys = utxos.map((v) => utxoPrivateKey0).filter((v) => v);
    const signerSelecteds = [0, 1];

    const tokenInputArray = ftUtxos.map((v) => {
      const preTx = new bsv.Transaction(v.preTxHex);
      const preLockingScript = preTx.outputs[v.preOutputIndex].script;
      const tx = new bsv.Transaction(v.txHex);
      const lockingScript = tx.outputs[v.outputIndex].script;
      return {
        satoshis: v.satoshis,
        txId: v.txId,
        outputIndex: v.outputIndex,
        lockingScript,
        preTxId: v.preTxId,
        preOutputIndex: v.preOutputIndex,
        preLockingScript,
        preTokenAddress: new bsv.Address(v.preTokenAddress, this.network),
        preTokenAmount: v.preTokenAmount,
      };
    });

    const satoshiInputArray = utxos.map((v) => ({
      lockingScript: bsv.Script.buildPublicKeyHashOut(v.address).toHex(),
      satoshis: v.satoshis,
      txId: v.txId,
      outputIndex: v.outputIndex,
    }));

    let checkRabinMsgArray = Buffer.alloc(0);
    let checkRabinPaddingArray = Buffer.alloc(0);
    let checkRabinSigArray = Buffer.alloc(0);

    //???????????????????????????
    let sigReqArray = [];
    for (let i = 0; i < ftUtxos.length; i++) {
      let v = ftUtxos[i];
      sigReqArray[i] = [];
      for (let j = 0; j < 2; j++) {
        const signerIndex = signerSelecteds[j];
        sigReqArray[i][j] = this.signers[signerIndex].satoTxSigUTXOSpendByUTXO({
          txId: v.preTxId,
          index: v.preOutputIndex,
          txHex: v.preTxHex,
          byTxIndex: v.outputIndex,
          byTxId: v.txId,
          byTxHex: v.txHex,
        });
      }
    }

    //?????????routeCheck???????????????
    for (let i = 0; i < sigReqArray.length; i++) {
      for (let j = 0; j < sigReqArray[i].length; j++) {
        let sigInfo = await sigReqArray[i][j];
        if (j == 0) {
          checkRabinMsgArray = Buffer.concat([
            checkRabinMsgArray,
            Buffer.from(sigInfo.byTxPayload, "hex"),
          ]);
        }

        const sigBuf = TokenUtil.toBufferLE(
          sigInfo.byTxSigBE,
          TokenUtil.RABIN_SIG_LEN
        );
        checkRabinSigArray = Buffer.concat([checkRabinSigArray, sigBuf]);
        const paddingCountBuf = Buffer.alloc(2, 0);
        paddingCountBuf.writeUInt16LE(sigInfo.byTxPadding.length / 2);
        const padding = Buffer.alloc(sigInfo.byTxPadding.length / 2, 0);
        padding.write(sigInfo.byTxPadding, "hex");
        checkRabinPaddingArray = Buffer.concat([
          checkRabinPaddingArray,
          paddingCountBuf,
          padding,
        ]);
      }
    }

    //?????????token???????????????
    const tokenRabinDatas = [];
    for (let i = 0; i < sigReqArray.length; i++) {
      let tokenRabinMsg;
      let tokenRabinSigArray = [];
      let tokenRabinPaddingArray = [];
      for (let j = 0; j < sigReqArray[i].length; j++) {
        let sigInfo = await sigReqArray[i][j];
        tokenRabinMsg = sigInfo.payload;
        tokenRabinSigArray.push(BigInt("0x" + sigInfo.sigBE));
        tokenRabinPaddingArray.push(new Bytes(sigInfo.padding));
      }
      tokenRabinDatas.push({
        tokenRabinMsg,
        tokenRabinSigArray,
        tokenRabinPaddingArray,
      });
    }

    let rabinPubKeyIndexArray = signerSelecteds;

    let transferPart2 = {
      routeCheckTx,
      tokenInputArray,
      satoshiInputArray,
      rabinPubKeyIndexArray,
      checkRabinMsgArray,
      checkRabinPaddingArray,
      checkRabinSigArray,
      tokenOutputArray,
      tokenRabinDatas,
      routeCheckContract,
      senderPrivateKey,
      senderPublicKey,
      changeAddress,
      utxoPrivateKeys,
      feeb: this.feeb,
      opreturnData,
      debug: this.debug,
      changeAddress0,
    };

    if (!senderPrivateKey) {
      delete transferPart2.routeCheckTx;
      this.transferPart2 = transferPart2;
      return { routeCheckTx };
    }
    let tx = await this.ft.createTransferTx(transferPart2);

    const size = tx.toBuffer().length;
    const feePaid = tx._getUnspentValue();
    const feeRate = feePaid / size;
    if (feeRate < this.feeb) {
      throw new Error(
        `Insufficient balance.The fee rate should not be less than ${this.feeb}, but in the end it is ${feeRate}.`
      );
    }

    return { routeCheckTx, tx };
  }

  /**
   * ????????????????????????????????????????????????????????????????????????
   * @param transferPart2
   * @returns
   */
  public async unsignTransfer(routeCheckTx: any) {
    let transferPart2 = this.transferPart2;
    transferPart2.routeCheckTx = routeCheckTx;
    transferPart2.satoshiInputArray.forEach((v) => {
      v.txId = routeCheckTx.id;
    });
    let tx = await this.ft.createTransferTx(transferPart2);

    let sigHashList: SigHashInfo[] = [];
    tx.inputs.forEach((input: any, inputIndex: number) => {
      let address = "";
      let isP2PKH;
      if (inputIndex == tx.inputs.length - 1) {
        //routeCheck???????????????
        return;
      } else if (inputIndex == tx.inputs.length - 2) {
        address = transferPart2.changeAddress0.toString();
        isP2PKH = true;
      } else {
        address = transferPart2.senderPublicKey
          .toAddress(this.network)
          .toString();
        isP2PKH = false;
      }
      sigHashList.push({
        sighash: toHex(
          bsv.Transaction.sighash.sighash(
            tx,
            sighashType,
            inputIndex,
            input.output.script,
            input.output.satoshisBN
          )
        ),
        sighashType,
        address,
        inputIndex,
        isP2PKH,
      });
    });
    return { tx, sigHashList };
  }

  /**
   * ??????????????????????????????????????????20???utxo
   * @param genesis ?????????genesis
   * @param codehash ?????????codehash
   * @param senderWif ????????????????????????wif
   * @param utxos (??????)??????utxos
   * @param changeAddress (??????)??????????????????
   * @param opreturnData (??????)????????????opReturn??????
   * @param noBroadcast (??????)??????????????????????????????false
   * @returns
   */
  public async merge({
    codehash,
    genesis,
    ownerWif,
    utxos,
    changeAddress,
    noBroadcast = false,
    opreturnData,
  }: {
    codehash: string;
    genesis: string;
    ownerWif: string;
    utxos?: any;
    changeAddress?: any;
    noBroadcast?: boolean;
    opreturnData?: any;
  }) {
    $.checkArgument(ownerWif, "ownerWif is required");
    return await this.transfer({
      codehash,
      genesis,
      senderWif: ownerWif,
      utxos,
      changeAddress,
      isMerge: true,
      noBroadcast,
      receivers: [],
      opreturnData,
    });
  }

  /**
   * ??????(????????????)????????????????????????????????????????????????20???utxo
   * @param genesis ?????????genesis
   * @param codehash ?????????codehash
   * @param senderWif ????????????????????????wif
   * @param utxos (??????)??????utxos
   * @param changeAddress (??????)??????????????????
   * @param opreturnData (??????)????????????opReturn??????
   * @returns
   */
  public async unsignPreMerge({
    codehash,
    genesis,
    ownerPublicKey,
    utxos,
    changeAddress,
    opreturnData,
  }: {
    codehash: string;
    genesis: string;
    ownerPublicKey: string;
    utxos?: any;
    changeAddress?: any;
    opreturnData?: any;
  }) {
    return await this.unsignPreTransfer({
      codehash,
      genesis,
      senderPublicKey: ownerPublicKey,
      utxos,
      changeAddress,
      isMerge: true,
      receivers: [],
      opreturnData,
    });
  }

  /**
   * ??????(????????????)?????????????????????????????????
   * @param routeCheckTx
   * @returns
   */
  public async unsignMerge(routeCheckTx) {
    return await this.unsignTransfer(routeCheckTx);
  }

  /**
   * ?????????????????????FT??????
   * @param codehash
   * @param genesis
   * @param address
   * @returns
   */
  public async getBalance({ codehash, genesis, address }) {
    let {
      balance,
      pendingBalance,
    } = await this.sensibleApi.getFungibleTokenBalance(
      codehash,
      genesis,
      address
    );
    return balance + pendingBalance;
  }

  /**
   * ?????????????????????FT???????????????utxo?????????
   * @param codehash
   * @param genesis
   * @param address
   * @returns
   */
  public async getBalanceDetail({
    codehash,
    genesis,
    address,
  }: {
    codehash: string;
    genesis: string;
    address: string;
  }) {
    return await this.sensibleApi.getFungibleTokenBalance(
      codehash,
      genesis,
      address
    );
  }

  /**
   * ?????????????????????FT Token?????????????????????token?????????
   * @param address
   * @returns
   */
  public async getSummary(address: string) {
    return await this.sensibleApi.getFungibleTokenSummary(address);
  }

  /**
   * ??????genesis?????????
   * @param opreturnData
   * @returns
   */
  public async getGenesisEstimateFee({ opreturnData }) {
    let p2pkhInputNum = 1;
    let p2pkhOutputNum = 1;
    p2pkhInputNum = 10; //??????10???????????????

    const sizeOfTokenGenesis = SizeHelper.getSizeOfTokenGenesis();
    let size =
      4 +
      1 +
      p2pkhInputNum * (32 + 4 + 1 + 107 + 4) +
      1 +
      (8 + 3 + sizeOfTokenGenesis) +
      (opreturnData ? 8 + 3 + opreturnData.toString().length / 2 : 0) +
      p2pkhOutputNum * (8 + 1 + 25) +
      4;

    let dust = Utils.getDustThreshold(sizeOfTokenGenesis);
    let fee = Math.ceil(size * this.feeb) + dust;
    return Math.ceil(fee);
  }

  /**
   * ??????issue??????
   * ???10???utxo??????????????????????????????????????????
   * @param param0
   * @returns
   */
  public async getIssueEstimateFee({
    opreturnData,
    allowIncreaseIssues = true,
  }) {
    let p2pkhUnlockingSize = 32 + 4 + 1 + 107 + 4;
    let p2pkhLockingSize = 8 + 1 + 25;

    let p2pkhInputNum = 1; //??????1??????
    let p2pkhOutputNum = 1; //??????1??????
    p2pkhInputNum = 10; //??????10???????????????

    const tokenGenesisLockingSize = SizeHelper.getSizeOfTokenGenesis();
    const tokenLockingSize = SIZE_OF_TOKEN;
    const preimageSize = 159 + tokenGenesisLockingSize;
    const sigSize = 72;
    const rabinMsgSize = 96;
    const rabinPaddingArraySize = 2 * 2;
    const rabinSigArraySize = 128 * 2;
    const rabinPubKeyIndexArraySize = 2;
    const genesisContractSatoshisSize = 8;
    const tokenContractSatoshisSize = 8;
    const changeAddressSize = 20;
    const changeAmountSize = 8;
    const opreturnSize = opreturnData
      ? 8 + 3 + new bsv.Script.buildSafeDataOut(opreturnData).toBuffer().length
      : 0;
    let tokenGenesisUnlockingSize =
      preimageSize +
      sigSize +
      rabinMsgSize +
      rabinPaddingArraySize +
      rabinSigArraySize +
      rabinPubKeyIndexArraySize +
      genesisContractSatoshisSize +
      tokenLockingSize +
      tokenContractSatoshisSize +
      changeAddressSize +
      changeAmountSize +
      opreturnSize;

    let sumSize =
      p2pkhInputNum * p2pkhUnlockingSize + tokenGenesisUnlockingSize;
    if (allowIncreaseIssues) {
      sumSize += tokenGenesisLockingSize;
    }
    sumSize += tokenLockingSize;
    sumSize += p2pkhLockingSize;

    let fee = 0;
    fee = sumSize * this.feeb;
    if (allowIncreaseIssues) {
      fee += Utils.getDustThreshold(tokenGenesisLockingSize);
    }
    fee += Utils.getDustThreshold(tokenLockingSize);
    fee -= Utils.getDustThreshold(tokenGenesisLockingSize);

    return Math.ceil(fee);
  }

  /**
   * ??????????????????
   * @param genesis
   * @param codehash
   * @param senderWif
   * @param receivers
   * @param opreturnData
   * @returns
   */
  public async getTransferEstimateFee({
    codehash,
    genesis,
    senderWif,
    receivers,
    opreturnData,
    isMerge,
  }: {
    codehash: string;
    genesis: string;
    senderWif: string;
    receivers: any;
    opreturnData?: any;
    isMerge?: boolean;
  }) {
    let p2pkhInputNum = 1; //??????1??????
    p2pkhInputNum = 10; //??????10???????????????

    const senderPrivateKey = bsv.PrivateKey.fromWIF(senderWif);
    const senderPublicKey = senderPrivateKey.toPublicKey();

    let senderAddress = senderPublicKey.toAddress(this.network);

    //??????token???utxo
    let ftUtxos = await this.sensibleApi.getFungibleTokenUnspents(
      codehash,
      genesis,
      senderAddress.toString(),
      20
    );
    ftUtxos.forEach((v) => (v.tokenAmount = BigInt(v.tokenAmount)));

    let mergeUtxos = [];
    let mergeTokenAmountSum = BigInt(0);
    if (isMerge) {
      mergeUtxos = ftUtxos.slice(0, 20);
      mergeTokenAmountSum = mergeUtxos.reduce(
        (pre, cur) => pre + BigInt(cur.tokenAmount),
        BigInt(0)
      );
      receivers = [
        {
          address: senderAddress.toString(),
          amount: mergeTokenAmountSum,
        },
      ];
    }
    //??????????????????
    let tokenOutputArray = receivers.map((v) => ({
      address: new bsv.Address(v.address, this.network),
      tokenAmount: BigInt(v.amount),
    }));

    //????????????????????????
    let outputTokenAmountSum = tokenOutputArray.reduce(
      (pre, cur) => pre + cur.tokenAmount,
      BigInt(0)
    );

    //token???????????????
    let inputTokenAmountSum = BigInt(0);
    let _ftUtxos = [];
    for (let i = 0; i < ftUtxos.length; i++) {
      let ftUtxo = ftUtxos[i];
      _ftUtxos.push(ftUtxo);
      inputTokenAmountSum += ftUtxo.tokenAmount;
      if (i == 9 && inputTokenAmountSum >= outputTokenAmountSum) {
        //???????????????10To10
        break;
      }
      if (inputTokenAmountSum >= outputTokenAmountSum) {
        break;
      }
    }

    if (isMerge) {
      _ftUtxos = mergeUtxos;
      inputTokenAmountSum = mergeTokenAmountSum;
    }

    ftUtxos = _ftUtxos;

    if (inputTokenAmountSum < outputTokenAmountSum) {
      throw new Error(
        `insufficent token.Need ${outputTokenAmountSum} But only ${inputTokenAmountSum}`
      );
    }
    //??????????????????token??????
    let changeTokenAmount = inputTokenAmountSum - outputTokenAmountSum;
    if (changeTokenAmount > BigInt(0)) {
      tokenOutputArray.push({
        address: senderPublicKey.toAddress(this.network),
        tokenAmount: changeTokenAmount,
      });
    }

    //??????xTox???????????????
    let routeCheckType: RouteCheckType;
    let inputLength = ftUtxos.length;
    let outputLength = tokenOutputArray.length;
    let sizeOfRouteCheck = 0;
    if (inputLength <= 3) {
      if (outputLength <= 3) {
        routeCheckType = RouteCheckType.from3To3;
        sizeOfRouteCheck = SIZE_OF_ROUTE_CHECK_TYPE_3To3;
      } else if (outputLength <= 100) {
        routeCheckType = RouteCheckType.from3To100;
        sizeOfRouteCheck = SIZE_OF_ROUTE_CHECK_TYPE_3To100;
      } else {
        throw new Error(
          `unsupport transfer from inputs(${inputLength}) to outputs(${outputLength})`
        );
      }
    } else if (inputLength <= 6) {
      if (outputLength <= 6) {
        routeCheckType = RouteCheckType.from6To6;
        sizeOfRouteCheck = SIZE_OF_ROUTE_CHECK_TYPE_6To6;
      } else {
        throw new Error(
          `unsupport transfer from inputs(${inputLength}) to outputs(${outputLength})`
        );
      }
    } else if (inputLength <= 10) {
      if (outputLength <= 10) {
        routeCheckType = RouteCheckType.from10To10;
        sizeOfRouteCheck = SIZE_OF_ROUTE_CHECK_TYPE_10To10;
      } else {
        throw new Error(
          `unsupport transfer from inputs(${inputLength}) to outputs(${outputLength})`
        );
      }
    } else if (inputLength <= 20) {
      if (outputLength <= 3) {
        routeCheckType = RouteCheckType.from20To3;
        sizeOfRouteCheck = SIZE_OF_ROUTE_CHECK_TYPE_20To3;
      } else {
        throw new Error(
          `unsupport transfer from inputs(${inputLength}) to outputs(${outputLength})`
        );
      }
    } else {
      throw new Error("Too many token-utxos, should merge them to continue.");
    }

    let estimateSatoshis = this._calTransferSize({
      inputTokenNum: inputLength,
      outputTokenNum: outputLength,
      tokenLockingSize: SIZE_OF_TOKEN,
      routeCheckLockingSize: sizeOfRouteCheck,
      opreturnData,
    });

    return estimateSatoshis;
  }

  public async getMergeEstimateFee({
    codehash,
    genesis,
    ownerWif,
    opreturnData,
  }: {
    codehash: string;
    genesis: string;
    ownerWif: string;
    opreturnData?: any;
  }) {
    $.checkArgument(ownerWif, "ownerWif is required");
    return await this.getTransferEstimateFee({
      codehash,
      genesis,
      senderWif: ownerWif,
      opreturnData,
      receivers: [],
      isMerge: true,
    });
  }
  /**
   * ???????????????????????????
   * @param tx
   * @param sigHashList
   * @param sigList
   */
  public sign(tx: any, sigHashList: SigHashInfo[], sigList: SigInfo[]) {
    Utils.sign(tx, sigHashList, sigList);
  }

  /**
   * ??????????????????
   * @param txHex
   * @param apiTarget ?????????????????????sensible???metasv?????????sensible
   */
  public async broadcast(txHex: string, apiTarget?: string) {
    return await this.sensibleApi.broadcast(txHex, apiTarget);
  }

  /**
   * ???????????????codehash???genesis
   * @param genesisTxId genesis???txid
   * @param genesisOutputIndex (??????)genesis???outputIndex????????????0
   * @returns
   */
  public async getCodehashAndGensis(
    genesisTxId: string,
    genesisOutputIndex: number = 0
  ) {
    let genesisTxHex = await this.sensibleApi.getRawTxData(genesisTxId);
    let genesisTx = new bsv.Transaction(genesisTxHex);
    let genesis = getGenesis(genesisTxId, genesisOutputIndex);
    let tokenContract = this.ft.createTokenContract(
      genesisTxId,
      genesisOutputIndex,
      genesisTx.outputs[genesisOutputIndex].script,
      {
        receiverAddress: new bsv.Address(this.zeroAddress), //dummy address
        tokenAmount: BigInt(0),
      }
    );
    let codehash = Utils.getCodeHash(tokenContract.lockingScript);

    return { codehash, genesis };
  }

  /**
   * ???????????????codehash???genesis
   * @param genesisTx genesis???tx
   * @param genesisOutputIndex (??????)genesis???outputIndex????????????0
   * @returns
   */
  public getCodehashAndGensisByTx(
    genesisTx: any,
    genesisOutputIndex: number = 0
  ) {
    let genesisTxId = genesisTx.id;
    let genesis = getGenesis(genesisTxId, genesisOutputIndex);
    let tokenContract = this.ft.createTokenContract(
      genesisTxId,
      genesisOutputIndex,
      genesisTx.outputs[genesisOutputIndex].script,
      {
        receiverAddress: new bsv.Address(this.zeroAddress), //dummy address
        tokenAmount: BigInt(0),
      }
    );
    let codehash = Utils.getCodeHash(tokenContract.lockingScript);

    return { codehash, genesis };
  }

  private _calTransferSize({
    p2pkhInputNum = 10,
    inputTokenNum,
    outputTokenNum,
    tokenLockingSize,
    routeCheckLockingSize,
    opreturnData,
  }) {
    let sumFee = 0;

    let tokenUnlockingSizeSum = 0;
    for (let i = 0; i < inputTokenNum; i++) {
      let preimageSize = 159 + tokenLockingSize;
      let tokenInputIndexSize = 1;
      let prevoutsSize = (inputTokenNum + 1 + 1) * 36;
      let tokenRabinMsgSize = 96;
      let tokenRabinPaddingArraySize = 2 * 2;
      let tokenRabinSigArraySize = 128 * 2;
      let rabinPubKeyIndexArraySize = 2;
      let routeCheckInputIndexSize = 1;
      let tokenOutputLenSize = 1;
      let tokenAddressSize = 20;
      let preTokenAmountSize = 8;
      let senderPublicKeySize = 33;
      let sigSize = 72;
      let tokenUnlockingSize =
        preimageSize +
        tokenInputIndexSize +
        prevoutsSize +
        tokenRabinMsgSize +
        tokenRabinPaddingArraySize +
        tokenRabinSigArraySize +
        rabinPubKeyIndexArraySize +
        routeCheckInputIndexSize +
        routeCheckLockingSize +
        1 +
        tokenOutputLenSize +
        tokenAddressSize +
        preTokenAmountSize +
        senderPublicKeySize +
        sigSize +
        1 +
        1 +
        1 +
        1;
      tokenUnlockingSizeSum += tokenUnlockingSize;
    }

    let preimageSize = 159 + routeCheckLockingSize;
    let prevoutsSize = (inputTokenNum + 1 + 1) * 36;
    let checkRabinMsgArraySize = 64 * inputTokenNum;
    let checkRabinPaddingArraySize = 8 * inputTokenNum;
    let checkRabinSigArraySize = 256 * inputTokenNum;
    let rabinPubKeyIndexArraySize = 2;
    let inputTokenAddressArraySize = 20 * inputTokenNum;
    let inputTokenAmountArray = 8 * inputTokenNum;
    let outputSatoshiArraySize = 8 * outputTokenNum;
    let changeAmountSize = 8;
    let changeAddressSize = 20;
    let opreturnSize = opreturnData
      ? 8 + 3 + new bsv.Script.buildSafeDataOut(opreturnData).toBuffer().length
      : 0;
    let routeCheckUnlockingSize =
      preimageSize +
      tokenLockingSize +
      prevoutsSize +
      checkRabinMsgArraySize +
      checkRabinPaddingArraySize +
      checkRabinSigArraySize +
      rabinPubKeyIndexArraySize +
      inputTokenAddressArraySize +
      inputTokenAmountArray +
      outputSatoshiArraySize +
      changeAmountSize +
      changeAddressSize +
      opreturnSize;

    let p2pkhUnlockingSize = 32 + 4 + 1 + 107 + 4;
    let p2pkhLockingSize = 8 + 1 + 25;

    //routeCheck tx
    sumFee +=
      (p2pkhUnlockingSize * p2pkhInputNum +
        routeCheckLockingSize +
        p2pkhLockingSize) *
        this.feeb +
      Utils.getDustThreshold(routeCheckLockingSize);

    //transfer tx
    sumFee +=
      (p2pkhUnlockingSize +
        tokenUnlockingSizeSum +
        routeCheckUnlockingSize +
        tokenLockingSize * outputTokenNum +
        p2pkhLockingSize) *
        this.feeb +
      Utils.getDustThreshold(tokenLockingSize) * outputTokenNum -
      Utils.getDustThreshold(tokenLockingSize) * inputTokenNum -
      Utils.getDustThreshold(routeCheckLockingSize);

    return Math.ceil(sumFee);
  }

  /**
   * ????????????
   * @param tx
   */
  public dumpTx(tx) {
    Utils.dumpTx(tx, this.network);
  }
}

module.exports = { SensibleFT };
