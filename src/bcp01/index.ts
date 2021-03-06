import { bsv, toHex } from "scryptlib";
import { SatotxSigner, SignerConfig } from "../common/SatotxSigner";
import * as Utils from "../common/utils";
import { SigHashInfo, SigInfo } from "../common/utils";
import { API_NET, SensibleApi } from "../sensible-api";
import { NonFungibleToken, sighashType } from "./NonFungibleToken";
const dummyNetwork = "mainnet";
const dummyWif = "L5k7xi4diSR8aWoGKojSNTnc3YMEXEoNpJEaGzqWimdKry6CFrzz";
const dummyPrivateKey = bsv.PrivateKey.fromWIF(dummyWif);
const dummyAddress = dummyPrivateKey.toAddress(dummyNetwork);
const dummyPk = dummyPrivateKey.toPublicKey();
const dummyTxId =
  "c776133a77886693ba2484fe12d6bdfb8f8bcb7a237e4a8a6d0f69c7d1879a08";
const dummyUtxo = {
  txId: dummyTxId,
  outputIndex: 0,
  satoshis: 1000000000,
  wif: dummyWif,
};

type ParamUtxo = {
  txId: string;
  outputIndex: number;
  satoshis: number;
  wif: string;
  address?: any;
};
const defaultSignerConfigs: SignerConfig[] = [
  {
    satotxApiPrefix: "https://api.satotx.com",
    satotxPubKey:
      "25108ec89eb96b99314619eb5b124f11f00307a833cda48f5ab1865a04d4cfa567095ea4dd47cdf5c7568cd8efa77805197a67943fe965b0a558216011c374aa06a7527b20b0ce9471e399fa752e8c8b72a12527768a9fc7092f1a7057c1a1514b59df4d154df0d5994ff3b386a04d819474efbd99fb10681db58b1bd857f6d5",
  },
];

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
  if (signers.length != 1) {
    throw new Error("only support 1 signer");
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
		}]`);
  }
}

function checkParamNetwork(network) {
  if (!["mainnet", "testnet"].includes(network)) {
    throw new Error(
      `NetworkFormatError:only support 'mainnet' and 'testnet' but value is ${network}`
    );
  }
}

function checkParamGenesis(genesis) {
  if (typeof genesis != "string" || genesis.length != 80) {
    throw new Error(
      `GenesisFormatError:genesis should be a string with 80 length `
    );
  }
}

function checkParamCodehash(codehash) {
  if (typeof codehash != "string" || codehash.length != 40) {
    throw new Error(
      `CodehashFormatError:codehash should be a string with 40 length `
    );
  }
}

function getGenesis(
  txid: string,
  index: number,
  issueOutputIndex: number = 0
): string {
  const txidBuf = Buffer.from(txid, "hex").reverse();
  const indexBuf = Buffer.alloc(4, 0);
  indexBuf.writeUInt32LE(index);
  const issueOutputIndexBuf = Buffer.alloc(4, 0);
  issueOutputIndexBuf.writeUInt32LE(issueOutputIndex);
  return toHex(Buffer.concat([txidBuf, indexBuf, issueOutputIndexBuf]));
}

function parseGenesis(genesis: string) {
  let tokenIDBuf = Buffer.from(genesis, "hex");
  let genesisTxId = tokenIDBuf.slice(0, 32).reverse().toString("hex");
  let genesisOutputIndex = tokenIDBuf.readUIntLE(32, 4);
  let issueOutputIndex = tokenIDBuf.readUIntLE(36, 4);
  return {
    genesisTxId,
    genesisOutputIndex,
    issueOutputIndex,
  };
}

/**
Sensible Non Fungible Token
??????????????????????????????
 */
export class SensibleNFT {
  private signers: SatotxSigner[];
  private feeb: number;
  private network: API_NET;
  private mock: boolean;
  private purse: string;
  private sensibleApi: SensibleApi;
  private nft: NonFungibleToken;
  private debug: boolean;
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
    feeb: number;
    network: API_NET;
    mock: boolean;
    purse: string;
    debug: boolean;
  }) {
    checkParamSigners(signers);
    checkParamNetwork(network);
    this.signers = signers.map(
      (v) => new SatotxSigner(v.satotxApiPrefix, v.satotxPubKey)
    );

    this.feeb = feeb;
    this.network = network;
    this.mock = mock;
    this.sensibleApi = new SensibleApi(network);
    this.purse = purse;
    this.nft = new NonFungibleToken(BigInt("0x" + signers[0].satotxPubKey));
    this.debug = debug;
  }

  private async _pretreatUtxos(utxos: ParamUtxo[]) {
    let utxoPrivateKeys = [];
    if (utxos) {
      checkParamUtxoFormat(utxos[0]);
      utxos.forEach((v) => {
        let privateKey = bsv.PrivateKey.fromWIF(v.wif);
        v.address = privateKey.toAddress(this.network);
        utxoPrivateKeys.push(privateKey);
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
   * ??????genesis??????
   * @param genesisWif ????????????
   * @param totalSupply ???????????????,8??????
   * @param opreturnData (??????)????????????opReturn??????
   * @param utxos (??????)??????utxos
   * @param changeAddress (??????)????????????
   * @param noBroadcast (??????)??????????????????????????????false
   * @returns
   */
  public async genesis({
    genesisWif,
    totalSupply,
    opreturnData,
    utxos,
    changeAddress,
    noBroadcast = false,
  }: {
    genesisWif: string;
    totalSupply: string | bigint;
    opreturnData: any;
    utxos?: ParamUtxo[];
    changeAddress?: any;
    noBroadcast?: boolean;
  }): Promise<{
    codehash: string;
    genesis: string;
    txid: string;
    txHex: string;
    tx: any;
  }> {
    const genesisPrivateKey = new bsv.PrivateKey(genesisWif);
    const genesisPublicKey = genesisPrivateKey.toPublicKey();

    let utxoInfo = await this._pretreatUtxos(utxos);
    if (changeAddress) {
      changeAddress = new bsv.Address(changeAddress, this.network);
    } else {
      changeAddress = utxoInfo.utxos[0].address;
    }

    totalSupply = BigInt(totalSupply);

    let { tx, codehash, genesis } = await this._genesis({
      genesisPublicKey,
      totalSupply,
      opreturnData,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress,
    });
    let txHex = tx.serialize(true);
    if (!noBroadcast && !this.mock) {
      await this.sensibleApi.broadcast(txHex);
    }
    return { codehash, genesis, tx, txid: tx.id, txHex };
  }

  /**
   * ??????(????????????)genesis??????
   * @param genesisPublicKey ????????????
   * @param totalSupply ???????????????,8??????
   * @param opreturnData (??????)????????????opReturn??????
   * @param utxos (??????)??????utxos
   * @param changeAddress (??????)????????????
   * @returns
   */
  public async unsignGenesis({
    genesisPublicKey,
    totalSupply,
    opreturnData,
    utxos,
    changeAddress,
  }: {
    genesisPublicKey: string;
    totalSupply: string | bigint;
    opreturnData?: any;
    utxos?: ParamUtxo[];
    changeAddress?: any;
  }): Promise<{
    tx: any;
    sigHashList: SigHashInfo[];
  }> {
    genesisPublicKey = new bsv.PublicKey(genesisPublicKey);
    let utxoInfo = await this._pretreatUtxos(utxos);
    if (changeAddress) {
      changeAddress = new bsv.Address(changeAddress, this.network);
    } else {
      changeAddress = utxoInfo.utxos[0].address;
    }

    totalSupply = BigInt(totalSupply);

    let { tx, codehash, genesis } = await this._genesis({
      genesisPublicKey,
      totalSupply,
      opreturnData,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress,
    });

    let sigHashList: SigHashInfo[] = [];
    tx.inputs.forEach((input: any, inputIndex: number) => {
      let address = utxoInfo.utxos[inputIndex].address.toString();
      let isP2PKH = true;

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

  private async _genesis({
    genesisPublicKey,
    totalSupply,
    opreturnData,
    utxos,
    utxoPrivateKeys,
    changeAddress,
  }: {
    genesisPublicKey: any;
    totalSupply: bigint;
    opreturnData?: any;
    utxos?: ParamUtxo[];
    utxoPrivateKeys: any[];
    changeAddress?: any;
  }): Promise<{ tx: any; genesis: string; codehash: string }> {
    const utxoTxId = utxos[utxos.length - 1].txId;
    const utxoOutputIndex = utxos[utxos.length - 1].outputIndex;

    this.nft.setTxGenesisPart({
      prevTxId: utxoTxId,
      outputIndex: utxoOutputIndex,
    });
    let tx = await this.nft.makeTxGenesis({
      genesisPublicKey,
      tokenId: BigInt(0),
      totalSupply,
      opreturnData,

      utxos,
      changeAddress,
      utxoPrivateKeys,
      feeb: this.feeb,
    });

    let genesis = toHex(getGenesis(utxoTxId, utxoOutputIndex));
    let codehash = toHex(Utils.getCodeHash(tx.outputs[0].script));

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
   * ??????????????????NFT?????????
   * @param genesis NFT???genesis
   * @param codehash NFT???codehash
   * @param genesisWif ????????????wif
   * @param metaTxId NFTState
   * @param opreturnData (??????)????????????opReturn??????
   * @param receiverAddress ??????????????????
   * @param utxos (??????)??????utxos
   * @param changeAddress (??????)??????????????????
   * @param noBroadcast (??????)??????????????????????????????false
   * @returns {Object} {txid,tokenid}
   */
  public async issue({
    genesis,
    codehash,
    genesisWif,
    receiverAddress,
    metaTxId,
    opreturnData,
    utxos,
    changeAddress,
    noBroadcast = false,
  }: {
    genesis: string;
    codehash: string;
    genesisWif: string;
    receiverAddress: string;
    metaTxId: string;
    opreturnData?: any;
    utxos?: any[];
    changeAddress?: string;
    noBroadcast?: boolean;
  }): Promise<{ txHex: string; txid: string; tx: any }> {
    checkParamGenesis(genesis);
    checkParamCodehash(codehash);

    const genesisPrivateKey = new bsv.PrivateKey(genesisWif);
    const genesisPublicKey = genesisPrivateKey.toPublicKey();
    let utxoInfo = await this._pretreatUtxos(utxos);
    if (changeAddress) {
      changeAddress = new bsv.Address(changeAddress, this.network);
    } else {
      changeAddress = utxoInfo.utxos[0].address;
    }

    receiverAddress = new bsv.Address(receiverAddress, this.network);

    let { tx } = await this._issue({
      genesis,
      codehash,
      genesisPrivateKey,
      genesisPublicKey,
      receiverAddress,
      metaTxId,
      opreturnData,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress: changeAddress,
    });

    let txHex = tx.serialize(true);
    if (!noBroadcast && !this.mock) {
      await this.sensibleApi.broadcast(txHex);
    }

    return { txHex, txid: tx.id, tx };
  }

  /**
   * ??????(????????????)????????????
   * @param genesis NFT???genesis
   * @param codehash NFT???codehash
   * @param genesisPublicKey ????????????
   * @param receiverAddress ????????????
   * @param metaTxId NFT????????????????????????metaid
   * @param opreturnData (??????)????????????opReturn??????
   * @param utxos (??????)??????utxos
   * @param changeAddress (??????)????????????
   * @returns
   */
  public async unsignIssue({
    genesis,
    codehash,
    genesisPublicKey,
    receiverAddress,
    metaTxId,
    opreturnData,
    utxos,
    changeAddress,
  }: {
    genesis: string;
    codehash: string;
    genesisPublicKey: any;
    receiverAddress: string;
    metaTxId: string;
    opreturnData?: any;
    utxos?: any[];
    changeAddress?: string;
  }): Promise<{ tx: any; sigHashList: SigHashInfo[] }> {
    checkParamGenesis(genesis);
    checkParamCodehash(codehash);

    genesisPublicKey = new bsv.PublicKey(genesisPublicKey);
    let utxoInfo = await this._pretreatUtxos(utxos);
    if (changeAddress) {
      changeAddress = new bsv.Address(changeAddress, this.network);
    } else {
      changeAddress = utxoInfo.utxos[0].address;
    }

    receiverAddress = new bsv.Address(receiverAddress, this.network);

    let { tx } = await this._issue({
      genesis,
      codehash,
      genesisPublicKey,
      receiverAddress,
      metaTxId,
      opreturnData,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress: changeAddress,
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
    genesisPrivateKey,
    genesisPublicKey,
    receiverAddress,
    metaTxId,
    opreturnData,
    utxos,
    utxoPrivateKeys,
    changeAddress,
  }: {
    genesis: string;
    codehash: string;
    genesisPrivateKey?: any;
    genesisPublicKey: any;
    receiverAddress: any;
    metaTxId: string;
    opreturnData?: any;
    utxos: any[];
    utxoPrivateKeys?: any[];
    changeAddress: any;
  }): Promise<{ tx: any; tokenid: bigint }> {
    const issuerAddress = genesisPublicKey.toAddress(this.network);

    let { genesisTxId, genesisOutputIndex } = parseGenesis(genesis);

    let issueNftUnspents = await this.sensibleApi.getNonFungibleTokenUnspents(
      codehash,
      genesis,
      issuerAddress.toString()
    );

    let issueNftUnspent = issueNftUnspents[0];
    if (!issueNftUnspent) {
      throw new Error("No issue-utxo available to continue");
    }
    let spendByTxId = issueNftUnspent.txId;
    let spendByOutputIndex = issueNftUnspent.outputIndex;
    let spendByTxHex = await this.sensibleApi.getRawTxData(spendByTxId);

    const preTx = new bsv.Transaction(spendByTxHex);
    const preInputIndex = preTx.inputs.length - 1; //????????????????????????????????????????????????
    let preUtxoTxId = preTx.inputs[preInputIndex].prevTxId.toString("hex");
    let preUtxoOutputIndex = preTx.inputs[preInputIndex].outputIndex;
    let preUtxoTxHex = await this.sensibleApi.getRawTxData(preUtxoTxId);

    const preIssueTx = new bsv.Transaction(spendByTxHex);
    const issuerLockingScript = preIssueTx.outputs[spendByOutputIndex].script;

    this.nft.setTxGenesisPart({
      prevTxId: genesisTxId,
      outputIndex: genesisOutputIndex,
    });
    let { tx, tokenid } = await this.nft.makeTxIssue({
      issuerTxId: spendByTxId,
      issuerOutputIndex: spendByOutputIndex,
      issuerLockingScript,
      satotxData: {
        index: preUtxoOutputIndex,
        txId: preUtxoTxId,
        txHex: preUtxoTxHex,
        byTxId: spendByTxId,
        byTxHex: spendByTxHex,
      },

      genesisPrivateKey,
      genesisPublicKey,
      metaTxId,
      receiverAddress,
      opreturnData,

      signers: this.signers,
      utxos,
      changeAddress,
      utxoPrivateKeys,
      feeb: this.feeb,
      debug: this.debug,
    });

    const size = tx.toBuffer().length;
    const feePaid = tx._getUnspentValue();
    const feeRate = feePaid / size;
    if (feeRate < this.feeb) {
      throw new Error(
        `Insufficient balance.The fee rate should not be less than ${this.feeb}, but in the end it is ${feeRate}.`
      );
    }
    return { tx, tokenid };
  }

  /**
   * ??????????????????NFT????????????????????????
   * @param genesis NFT???genesis
   * @param codehash NFT???genesis
   * @param tokenid NFT???tokenid
   * @param senderWif ???????????????wif
   * @param receiverAddress ??????????????????
   * @param opreturnData (??????)????????????opReturn??????
   * @param utxos (??????)??????utxos
   * @param changeAddress (??????)??????????????????
   * @param noBroadcast (??????)??????????????????????????????false
   * @returns
   */
  public async transfer({
    genesis,
    codehash,
    tokenid,
    senderWif,
    receiverAddress,
    opreturnData,
    utxos,
    changeAddress,
    noBroadcast = false,
  }: {
    genesis: string;
    codehash: string;
    tokenid: string;
    senderWif: string;
    receiverAddress: string;
    opreturnData?: any;
    utxos?: any[];
    changeAddress?: string;
    noBroadcast?: boolean;
  }): Promise<{ tx: any; txid: string; txHex: string }> {
    checkParamGenesis(genesis);
    checkParamCodehash(codehash);

    const senderPrivateKey = new bsv.PrivateKey(senderWif);
    const senderPublicKey = senderPrivateKey.toPublicKey();
    let utxoInfo = await this._pretreatUtxos(utxos);
    if (changeAddress) {
      changeAddress = new bsv.Address(changeAddress, this.network);
    } else {
      changeAddress = utxoInfo.utxos[0].address;
    }
    receiverAddress = new bsv.Address(receiverAddress, this.network);

    let { tx } = await this._transfer({
      genesis,
      codehash,
      tokenid,
      senderPrivateKey,
      senderPublicKey,
      receiverAddress,
      opreturnData,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress,
    });

    let txHex = tx.serialize(true);
    if (!noBroadcast && !this.mock) {
      await this.sensibleApi.broadcast(txHex);
    }
    return { tx, txHex, txid: tx.id };
  }

  /**
   * ??????????????????NFT?????????
   * @param genesis NFT???genesis
   * @param codehash NFT???genesis
   * @param tokenid NFT???tokenid
   * @param senderPublicKey ???????????????
   * @param receiverAddress ??????????????????
   * @param opreturnData (??????)????????????opReturn??????
   * @param utxos (??????)??????utxos
   * @param changeAddress (??????)??????????????????
   * @returns
   */
  public async unsignTransfer({
    genesis,
    codehash,
    tokenid,
    senderPublicKey,
    receiverAddress,
    opreturnData,
    utxos,
    changeAddress,
  }: {
    genesis: string;
    codehash: string;
    tokenid: string;
    senderPublicKey: any;
    receiverAddress: string;
    opreturnData?: any;
    utxos?: any[];
    changeAddress?: string;
  }): Promise<{ tx: any; sigHashList: SigHashInfo[] }> {
    checkParamGenesis(genesis);
    checkParamCodehash(codehash);

    senderPublicKey = new bsv.PublicKey(senderPublicKey);
    let utxoInfo = await this._pretreatUtxos(utxos);
    if (changeAddress) {
      changeAddress = new bsv.Address(changeAddress, this.network);
    } else {
      changeAddress = utxoInfo.utxos[0].address;
    }
    receiverAddress = new bsv.Address(receiverAddress, this.network);

    let { tx } = await this._transfer({
      genesis,
      codehash,
      tokenid,
      senderPublicKey,
      receiverAddress,
      opreturnData,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress,
    });

    let sigHashList: SigHashInfo[] = [];
    tx.inputs.forEach((input: any, inputIndex: number) => {
      let address = "";
      let isP2PKH;
      if (inputIndex == tx.inputs.length - 1) {
        address = senderPublicKey.toAddress(this.network).toString();
        isP2PKH = false;
      } else {
        address = utxoInfo.utxos[inputIndex].address.toString();
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

  private async _transfer({
    genesis,
    codehash,
    tokenid,
    senderPrivateKey,
    senderPublicKey,
    receiverAddress,
    opreturnData,
    utxos,
    utxoPrivateKeys,
    changeAddress,
  }: {
    genesis: string;
    codehash: string;
    tokenid: string;
    senderPrivateKey?: any;
    senderPublicKey: any;
    receiverAddress: any;
    opreturnData?: any;
    utxos: any[];
    utxoPrivateKeys: any[];
    changeAddress: any;
  }): Promise<{ tx: any }> {
    let balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0);
    if (balance == 0) {
      //????????????
      throw new Error("Insufficient balance.");
    }

    let { genesisTxId, genesisOutputIndex } = parseGenesis(genesis);
    let nftUtxo = await this.sensibleApi.getNonFungibleTokenUnspentDetail(
      codehash,
      genesis,
      tokenid
    );

    let spendByTxId = nftUtxo.txId;
    let spendByOutputIndex = nftUtxo.outputIndex;
    let spendByTxHex = await this.sensibleApi.getRawTxData(spendByTxId);

    const spendByTx = new bsv.Transaction(spendByTxHex);
    let preInput = spendByTx.inputs[spendByTx.inputs.length - 1]; //???????????????????????????????????????????????????
    let preUtxoTxId = preInput.prevTxId.toString("hex");
    let preUtxoOutputIndex = preInput.outputIndex;
    let preUtxoTxHex = await this.sensibleApi.getRawTxData(preUtxoTxId);

    utxos.forEach((utxo) => {
      utxo.address = new bsv.Address(utxo.address, this.network);
    });

    this.nft.setTxGenesisPart({
      prevTxId: genesisTxId,
      outputIndex: genesisOutputIndex,
    });

    const transferLockingScript = spendByTx.outputs[spendByOutputIndex].script;

    let tx = await this.nft.makeTxTransfer({
      transferTxId: spendByTxId,
      transferOutputIndex: spendByOutputIndex,
      transferLockingScript,
      satotxData: {
        index: preUtxoOutputIndex,
        txId: preUtxoTxId,
        txHex: preUtxoTxHex,
        byTxId: spendByTxId,
        byTxHex: spendByTxHex,
      },

      senderPrivateKey,
      senderPublicKey,
      receiverAddress,
      opreturnData,

      utxos,
      utxoPrivateKeys,
      changeAddress,
      feeb: this.feeb,
      signers: this.signers,
      debug: this.debug,
    });

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

  /**
   * ???????????????????????????NFT Token??????
   * @param address ????????????
   * @returns
   */
  async getSummary(address: string) {
    return await this.sensibleApi.getNonFungibleTokenSummary(address);
  }

  /**
   * ???????????????????????????NFT Token?????????
   * @param codehash NFT???codehash
   * @param genesis NFT???genesis
   * @param address ??????????????????
   * @returns
   */
  async getSummaryDetail(codehash: string, genesis: string, address: string) {
    return await this.sensibleApi.getNonFungibleTokenUnspents(
      codehash,
      genesis,
      address
    );
  }

  /**
   * ??????genesis????????????
   * @param opreturnData
   * @returns
   */
  async getGenesisEstimateFee({ opreturnData }: { opreturnData?: any }) {
    let p2pkhInputNum = 1;
    let p2pkhOutputNum = 1;
    p2pkhInputNum = 10; //??????10???????????????

    const sizeOfNft = 3514;
    let size =
      4 +
      1 +
      p2pkhInputNum * (32 + 4 + 1 + 107 + 4) +
      1 +
      (8 + 3 + sizeOfNft) +
      (opreturnData ? 8 + 3 + opreturnData.toString().length / 2 : 0) +
      p2pkhOutputNum * (8 + 1 + 25) +
      4;

    let dust = Utils.getDustThreshold(sizeOfNft);
    let fee = Math.ceil(size * this.feeb) + dust;
    return fee;
  }

  /**
   * ????????????NFT????????????
   * @param param0
   * @returns
   */
  async getIssueEstimateFee({ opreturnData }: { opreturnData?: any }) {
    let p2pkhInputNum = 1;
    let p2pkhOutputNum = 1;
    p2pkhInputNum = 10; //??????10???????????????

    const sizeOfNft = 3514;
    let size =
      4 +
      1 +
      p2pkhInputNum * (32 + 4 + 1 + 107 + 4) +
      (32 + 4 + 3 + sizeOfNft + 100 + 4) +
      1 +
      (8 + 3 + sizeOfNft) +
      (opreturnData ? 8 + 3 + opreturnData.toString().length / 2 : 0) +
      p2pkhOutputNum * (8 + 1 + 25) +
      4;

    let dust = Utils.getDustThreshold(sizeOfNft);
    let fee = Math.ceil(size * this.feeb) + dust;
    return fee;
  }

  /**
   * ????????????NFT???????????????
   * @param param0
   * @returns
   */
  async getTransferEstimateFee({ opreturnData }: { opreturnData?: any }) {
    let p2pkhInputNum = 1;
    let p2pkhOutputNum = 1;
    p2pkhInputNum = 10; //??????10???????????????

    const sizeOfNft = 3514;
    let size =
      4 +
      1 +
      p2pkhInputNum * (32 + 4 + 1 + 107 + 4) +
      (32 + 4 + 3 + sizeOfNft + 100 + 4) +
      1 +
      (8 + 3 + sizeOfNft) +
      (opreturnData ? 8 + 3 + opreturnData.toString().length / 2 : 0) +
      p2pkhOutputNum * (8 + 1 + 25) +
      4;

    let dust = 0;
    let fee = Math.ceil(size * this.feeb) + dust;
    return fee;
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
  public async broadcast(txHex: string, apiTarget: string) {
    return await this.sensibleApi.broadcast(txHex, apiTarget);
  }

  public dumpTx(tx) {
    Utils.dumpTx(tx, this.network);
  }
}
