import { Net } from "../net";
export enum API_NET {
  MAIN = "mainnet",
  TEST = "testnet",
}

type ResData = {
  code: number;
  data: any;
  msg: string;
};

type SensibleQueryUtxo = {
  address?: string;
  codehash?: string;
  genesis?: string;
  height?: number;
  idx?: number;
  isNFT?: boolean;
  satoshi?: number;
  scriptPk?: string;
  scriptType?: string;
  tokenAmount?: number;
  tokenDecimal?: number;
  tokenId?: string;
  txid?: string;
  vout?: number;
  metaTxId?: string;
};

type NonFungibleTokenUnspent = {
  txId: string;
  satoshis: number;
  outputIndex: number;
  rootHeight: number;
  lockingScript: string;
  tokenAddress: string;
  tokenId: number;
  metaTxId: string;
};

type FungibleTokenUnspent = {
  txId: string;
  satoshis: number;
  outputIndex: number;
  rootHeight: number;
  lockingScript: string;
  tokenAddress: string;
  tokenAmount: bigint;
};
export class SensibleApi {
  serverBase: string;
  constructor(apiNet: API_NET) {
    if (apiNet == API_NET.MAIN) {
      this.serverBase = "https://api.sensiblequery.com";
    } else {
      this.serverBase = "https://api.sensiblequery.com/test";
    }
  }

  /**
   * @param {string} address
   */
  async getUnspents(address: string) {
    let url = `${this.serverBase}/address/${address}/utxo`;
    let _res = await Net.httpGet(url, {});
    const { code, data, msg } = _res as ResData;
    if (code != 0) {
      throw { title: "request sensible api failed", url, msg };
    }
    let ret = data.map((v: SensibleQueryUtxo) => ({
      txId: v.txid,
      satoshis: v.satoshi,
      outputIndex: v.vout,
    }));
    return ret;
  }

  /**
   * @param {string} hex
   */
  async broadcast(
    txHex: string,
    apiTarget: string = "sensible"
  ): Promise<string> {
    if (apiTarget == "metasv") {
      let _res: any = await Net.httpPost(
        "https://apiv2.metasv.com/tx/broadcast",
        {
          hex: txHex,
        }
      );
      return _res.txid;
    } else {
      let url = `${this.serverBase}/pushtx`;
      let _res = await Net.httpPost(url, {
        txHex,
      });
      const { code, data, msg } = _res as ResData;
      if (code != 0) {
        console.log(txHex);
        throw { title: "request sensible api failed", url, msg };
      }
      return data;
    }
  }

  /**
   * @param {string} txid
   */
  async getRawTxData(txid: string): Promise<string> {
    let url = `${this.serverBase}/rawtx/${txid}`;
    let _res = await Net.httpGet(url, {});
    const { code, data, msg } = _res as ResData;
    if (code != 0) {
      throw { title: "request sensible api failed", url, msg };
    }
    if (!data) {
      console.log("getRawfailed", url);
    }
    return data;
  }

  /**
   * ??????FT??????CodeHash+??????genesis??????????????????utxo??????
   */
  async getFungibleTokenUnspents(
    codehash: string,
    genesis: string,
    address: string,
    size: number = 10
  ): Promise<any[]> {
    let url = `${this.serverBase}/ft/utxo/${codehash}/${genesis}/${address}?size=${size}`;
    let _res = await Net.httpGet(url, {});
    const { code, data, msg } = _res as ResData;
    if (code != 0) {
      throw { title: "request sensible api failed", url, msg };
    }
    if (!data) return [];
    let ret: FungibleTokenUnspent[] = data.map((v: SensibleQueryUtxo) => ({
      txId: v.txid,
      satoshis: v.satoshi,
      outputIndex: v.vout,
      rootHeight: 0,
      lockingScript: v.scriptPk,
      tokenAddress: address,
      tokenAmount: v.tokenAmount,
    }));
    return ret;
  }

  /**
   * ????????????????????????FT?????????
   */
  async getFungibleTokenBalance(
    codehash: string,
    genesis: string,
    address: string
  ): Promise<{ balance: number; pendingBalance: number; utxoCount: number }> {
    let url = `${this.serverBase}/ft/balance/${codehash}/${genesis}/${address}`;
    let _res = await Net.httpGet(url, {});
    const { code, data, msg } = _res as ResData;
    if (code != 0) {
      throw { title: "request sensible api failed", url, msg };
    }

    return data;
  }

  /**
   * ?????????????????????FT????????????
   */
  async getOutputFungibleToken(txid: string, index: number) {
    let url = `${this.serverBase}/tx/${txid}/out/${index}`;
    let _res = await Net.httpGet(url, {});
    const { code, data, msg } = _res as ResData;
    if (code != 0) {
      throw { title: "request sensible api failed", url, msg };
    }

    let ret = {
      txId: data.txid,
      satoshis: data.satoshi,
      outputIndex: data.vout,
      rootHeight: 0,
      lockingScript: data.scriptPk,
      tokenAddress: data.address,
      tokenAmount: data.tokenAmount,
    };
    return ret;
  }

  /**
   * ??????NFT??????CodeHash+??????genesis??????????????????utxo??????
   */
  async getNonFungibleTokenUnspents(
    codehash: string,
    genesis: string,
    address: string
  ): Promise<NonFungibleTokenUnspent[]> {
    let url = `${this.serverBase}/nft/utxo/${codehash}/${genesis}/${address}`;
    let _res = await Net.httpGet(url, {});
    const { code, data, msg } = _res as ResData;
    if (code != 0) {
      throw { title: "request sensible api failed", url, msg };
    }

    if (!data) return [];
    let ret: NonFungibleTokenUnspent[] = data.map((v: SensibleQueryUtxo) => ({
      txId: v.txid,
      satoshis: v.satoshi,
      outputIndex: v.vout,
      rootHeight: 0,
      lockingScript: v.scriptPk,
      tokenAddress: address,
      tokenId: v.tokenId,
      metaTxId: v.metaTxId,
    }));
    return ret;
  }

  /**
   * ????????????????????????FT???UTXO
   */
  async getNonFungibleTokenUnspentDetail(
    codehash: string,
    genesis: string,
    tokenid: string
  ) {
    let url = `${this.serverBase}/nft/utxo-detail/${codehash}/${genesis}/${tokenid}`;
    let _res = await Net.httpGet(url, {});
    const { code, data, msg } = _res as ResData;
    if (code != 0) {
      throw { title: "request sensible api failed", url, msg };
    }
    if (!data) return null;
    let ret = [data].map((v) => ({
      txId: v.txid,
      satoshis: v.satoshi,
      outputIndex: v.vout,
      rootHeight: 0,
      lockingScript: v.scriptPk,
      tokenAddress: v.address,
      tokenId: v.tokenId,
      metaTxId: v.metaTxId,
    }))[0];
    return ret;
  }

  async getOutputNonFungibleToken(txid: string, index: number) {
    let url = `${this.serverBase}/tx/${txid}/out/${index}`;
    let _res = await Net.httpGet(url, {});
    const { code, data, msg } = _res as ResData;
    if (code != 0) {
      throw { title: "request sensible api failed", url, msg };
    }

    let ret = {
      txId: data.txid,
      satoshis: data.satoshi,
      outputIndex: data.vout,
      rootHeight: 0,
      lockingScript: data.scriptPk,
      tokenAddress: data.address,
      tokenId: data.tokenId,
    };
    return ret;
  }

  /**
   * ?????????????????????FT Token?????????????????????token?????????
   */
  async getFungibleTokenSummary(
    address: string
  ): Promise<{
    codehash: string;
    genesis: string;
    pendingBalance: number;
    balance: number;
    symbol: string;
  }> {
    let url = `${this.serverBase}/ft/summary/${address}`;
    let _res = await Net.httpGet(url, {});
    const { code, data, msg } = _res as ResData;
    if (code != 0) {
      throw { title: "request sensible api failed", url, msg };
    }

    return data;
  }

  /**
   * ???????????????????????????NFT Token????????????????????????nft????????????
   * @param {String} address
   * @returns
   */
  async getNonFungibleTokenSummary(
    address: string
  ): Promise<{
    codehash: string;
    genesis: string;
    count: number;
    pendingCount: number;
    symbol: string;
  }> {
    let url = `${this.serverBase}/nft/summary/${address}`;
    let _res = await Net.httpGet(url, {});
    const { code, data, msg } = _res as ResData;
    if (code != 0) {
      throw { title: "request sensible api failed", url, msg };
    }

    return data;
  }
}

module.exports = { SensibleApi };
