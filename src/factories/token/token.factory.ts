import { ContractCallContext, Multicall } from 'ethereum-multicall';
import { BigNumber } from 'ethers';
import { ContractContext as ERC20ContractContext } from '../../ABI/types/erc20-contract';
import { ContractContext } from '../../common/contract-context';
import { ETH, isNativeEth } from '../../common/tokens/eth';
import { getAddress } from '../../common/utils/get-address';
import { UniswapVersion } from '../../enums/uniswap-version';
import { EthersProvider } from '../../ethers-provider';
import { UniswapContractContextV2 } from '../../uniswap-contract-context/uniswap-contract-context-v2';
import { UniswapContractContextV3 } from '../../uniswap-contract-context/uniswap-contract-context-v3';
import { AllowanceAndBalanceOf } from './models/allowance-balance-of';
import { Token } from './models/token';

export class TokenFactory {
  private _multicall = new Multicall({
    ethersProvider: this._ethersProvider.provider,
    tryAggregate: true,
  });

  private _erc20TokenContract =
    this._ethersProvider.getContract<ERC20ContractContext>(
      JSON.stringify(ContractContext.erc20Abi),
      getAddress(this._tokenContractAddress)
    );

  constructor(
    private _tokenContractAddress: string,
    private _ethersProvider: EthersProvider
  ) {}

  /**
   * Get the token details
   */
  public async getToken(): Promise<Token> {
    if (isNativeEth(this._tokenContractAddress)) {
      return ETH.info(this._ethersProvider.network().chainId);
    } else {
      const SYMBOL = 0;
      const DECIMALS = 1;
      const NAME = 2;

      const contractCallContext: ContractCallContext = {
        reference: 'token',
        contractAddress: getAddress(this._tokenContractAddress),
        abi: ContractContext.erc20Abi,
        calls: [
          {
            reference: `symbol`,
            methodName: 'symbol',
            methodParameters: [],
          },
          {
            reference: `decimals`,
            methodName: 'decimals',
            methodParameters: [],
          },
          {
            reference: `name`,
            methodName: 'name',
            methodParameters: [],
          },
        ],
      };

      const contractCallResults = await this._multicall.call(
        contractCallContext
      );
      const results =
        contractCallResults.results[contractCallContext.reference];

      return {
        chainId: this._ethersProvider.network().chainId,
        contractAddress: results.originalContractCallContext.contractAddress,
        symbol: results.callsReturnContext[SYMBOL].returnValues[0],
        decimals: results.callsReturnContext[DECIMALS].returnValues[0],
        name: results.callsReturnContext[NAME].returnValues[0],
      };
    }
  }

  /**
   * Get the allowance for the amount which can be moved from the contract
   * for a user
   * @param uniswapVersion The uniswap version
   * @ethereumAddress The users ethereum address
   */
  public async allowance(
    uniswapVersion: UniswapVersion,
    ethereumAddress: string
  ): Promise<string> {
    if (isNativeEth(this._tokenContractAddress)) {
      return '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    } else {
      const allowance = await this._erc20TokenContract.allowance(
        ethereumAddress,
        uniswapVersion === UniswapVersion.v2
          ? UniswapContractContextV2.routerAddress
          : UniswapContractContextV3.routerAddress
      );

      return allowance.toHexString();
    }
  }

  /**
   * Generate the token approve data allowance to move the tokens.
   * This will return the data for you to send as a transaction
   * @spender The contract address for which you are allowing to move tokens on your behalf
   * @value The amount you want to allow them to do
   */
  public generateApproveAllowanceData(spender: string, value: string): string {
    if (isNativeEth(this._tokenContractAddress)) {
      throw new Error('ETH does not need any allowance data');
    }
    return this._erc20TokenContract.interface.encodeFunctionData('approve', [
      spender,
      value,
    ]);
  }

  /**
   * Get the balance the user has of this token
   * @ethereumAddress The users ethereum address
   */
  public async balanceOf(ethereumAddress: string): Promise<string> {
    if (isNativeEth(this._tokenContractAddress)) {
      return await this._ethersProvider.balanceOf(ethereumAddress);
    } else {
      const balance = await this._erc20TokenContract.balanceOf(ethereumAddress);

      return balance.toHexString();
    }
  }

  /**
   * Get the total supply of tokens which exist
   */
  public async totalSupply(): Promise<string> {
    const totalSupply = await this._erc20TokenContract.totalSupply();

    return totalSupply.toHexString();
  }

  /**
   * Get allowance and balance
   * @param uniswapVersion The uniswap version
   * @param ethereumAddress The ethereum address
   */
  public async getAllowanceAndBalanceOf(
    uniswapVersion: UniswapVersion,
    ethereumAddress: string
  ): Promise<AllowanceAndBalanceOf> {
    if (isNativeEth(this._tokenContractAddress)) {
      return {
        allowance: await this.allowance(uniswapVersion, ethereumAddress),
        balanceOf: await this.balanceOf(ethereumAddress),
      };
    } else {
      const ALLOWANCE = 0;
      const BALANCEOF = 1;

      const contractCallContext: ContractCallContext = {
        reference: 'allowance-and-balance-of',
        contractAddress: getAddress(this._tokenContractAddress),
        abi: ContractContext.erc20Abi,
        calls: [
          {
            reference: 'allowance',
            methodName: 'allowance',
            methodParameters: [
              ethereumAddress,
              uniswapVersion === UniswapVersion.v2
                ? UniswapContractContextV2.routerAddress
                : UniswapContractContextV3.routerAddress,
            ],
          },
          {
            reference: 'balanceOf',
            methodName: 'balanceOf',
            methodParameters: [ethereumAddress],
          },
        ],
      };

      const contractCallResults = await this._multicall.call(
        contractCallContext
      );
      const results =
        contractCallResults.results[contractCallContext.reference];

      return {
        allowance: BigNumber.from(
          results.callsReturnContext[ALLOWANCE].returnValues[0]
        ).toHexString(),
        balanceOf: BigNumber.from(
          results.callsReturnContext[BALANCEOF].returnValues[0]
        ).toHexString(),
      };
    }
  }
}
