import 'dotenv/config';
import {
    newClient,
    writeArtifact,
    readArtifact,
    deployContract,
    executeContract,
    uploadContract,
    instantiateContract,
    queryContract,
    toEncodedBinary,
} from './helpers.js';
import { join } from 'path';
import { Chain, CosmosClient } from 'cosmos-client';
import { chainConfigs } from "./types.d/chain_configs.js";
import { strictEqual } from "assert";

const ARTIFACTS_PATH = '../artifacts';
const SECONDS_IN_DAY: number = 60 * 60 * 24; // min, hour, day

async function main() {
    const { furya, wallet } = newClient(); // Assuming newClient returns Furya Cosmos-SDK client and wallet
    console.log(`chainID: ${furya.config.chainID} wallet: ${wallet.address}`); // Assuming wallet object contains address property

    if (!chainConfigs.generalInfo.multisig) {
        throw new Error("Set the proper owner multisig for the contracts");
    }

    await uploadAndInitToken(furya, wallet);
    await uploadAndInitTreasury(furya, wallet);
    await uploadPairContracts(furya, wallet);
    await uploadAndInitStaking(furya, wallet);
    await uploadAndInitFactory(furya, wallet);
    await uploadAndInitRouter(furya, wallet);
    await uploadAndInitMaker(furya, wallet);

    await uploadAndInitVesting(furya, wallet);
    await uploadAndInitGenerator(furya, wallet);
    await setupVestingAccounts(furya, wallet);
}
async function uploadAndInitToken(furya, wallet) {
    let network = readArtifact(furya.config.chainID);
    if (!network.tokenCodeID) {
        network.tokenCodeID = await uploadContract(furya, wallet, join(ARTIFACTS_PATH, 'astroport_token.wasm')!);
        writeArtifact(network, furya.config.chainID);
    }
    if (!network.tokenAddress) {
        const tokenInitMsg = {
            // Define initialization message for token contract
            symbol: 'ASTRO', // Example: Define token symbol
            name: 'AstroToken', // Example: Define token name
            decimals: 18, // Example: Define token decimals
            initial_balances: [ // Example: Define initial balances for token holders
                {
                    address: 'address_1',
                    amount: '1000000000000000000000' // 1000 tokens
                },
                {
                    address: 'address_2',
                    amount: '2000000000000000000000' // 2000 tokens
                }
            ],
            mint: {
                minter: chainConfigs.token.admin || chainConfigs.generalInfo.multisig, // Example: Define minter address
                cap: '10000000000000000000000000' // Example: Define token minting cap
            },
            marketing: {
                marketing: chainConfigs.token.admin || chainConfigs.generalInfo.multisig // Example: Define marketing address
            }
        };
        console.log('Deploying Token...');
        let resp = await deployContract(
            furya,
            wallet,
            chainConfigs.token.admin || chainConfigs.generalInfo.multisig,
            join(ARTIFACTS_PATH, 'astroport_token.wasm'),
            tokenInitMsg,
            'Token Label'
        );
        network.tokenAddress = resp.shift().shift();
        writeArtifact(network, furya.config.chainID);
    }
}

async function uploadPairContracts(furya, wallet) {
    let network = readArtifact(furya.config.chainID);
    if (!network.pairCodeID) {
        console.log('Register Pair Contract...');
        network.pairCodeID = await uploadContract(furya, wallet, join(ARTIFACTS_PATH, 'astroport_pair.wasm')!);
        writeArtifact(network, furya.config.chainID);
    }
    if (!network.pairStableCodeID) {
        console.log('Register Stable Pair Contract...');
        network.pairStableCodeID = await uploadContract(furya, wallet, join(ARTIFACTS_PATH, 'astroport_pair_stable.wasm')!);
        writeArtifact(network, furya.config.chainID);
    }
}

async function uploadAndInitStaking(furya, wallet) {
    let network = readArtifact(furya.config.chainID);
    if (!network.stakingAddress) {
        const stakingInitMsg = {
            // Define initialization message for staking contract
            deposit_token_addr: network.tokenAddress, // Example: Define deposit token address
            token_code_id: network.xastroTokenCodeID, // Example: Define staked token code ID
            admin: chainConfigs.staking.admin || chainConfigs.generalInfo.multisig, // Example: Define admin address
            owner: chainConfigs.staking.initMsg.owner || chainConfigs.generalInfo.multisig, // Example: Define owner address
            marketing: chainConfigs.staking.initMsg.marketing.marketing || chainConfigs.generalInfo.multisig // Example: Define marketing address
        };
        console.log('Deploying Staking...');
        let resp = await deployContract(
            furya,
            wallet,
            chainConfigs.staking.admin || chainConfigs.generalInfo.multisig,
            join(ARTIFACTS_PATH, 'astroport_staking.wasm'),
            stakingInitMsg,
            'Staking Label'
        );
        network.stakingAddress = resp.shift().shift();
        network.xastroAddress = resp.shift().shift(); // Assuming xastroAddress is returned in the response
        writeArtifact(network, furya.config.chainID);
    }
}

async function uploadAndInitFactory(furya, wallet) {
    let network = readArtifact(furya.config.chainID);
    if (!network.factoryAddress) {
        const factoryInitMsg = {
            // Define initialization message for factory contract
            token_code_id: network.tokenCodeID, // Example: Define token code ID
            whitelist_code_id: network.whitelistCodeID, // Example: Define whitelist code ID
            owner: wallet.key.accAddress, // Example: Define owner address
            pair_configs: chainConfigs.factory.initMsg.pair_configs, // Example: Define pair configurations
            admin: chainConfigs.factory.admin || chainConfigs.generalInfo.multisig // Example: Define admin address
        };
        console.log('Deploying Factory...');
        let resp = await deployContract(
            furya,
            wallet,
            chainConfigs.factory.admin || chainConfigs.generalInfo.multisig,
            join(ARTIFACTS_PATH, 'astroport_factory.wasm'),
            factoryInitMsg,
            'Factory Label'
        );
        network.factoryAddress = resp.shift().shift();
        writeArtifact(network, furya.config.chainID);
        if (chainConfigs.factory.change_owner) {
            console.log('Propose owner for factory...');
            // Propose owner for factory if required
        }
    }
}

async function uploadAndInitRouter(furya, wallet) {
    let network = readArtifact(furya.config.chainID);
    if (!network.routerAddress) {
        const routerInitMsg = {
            // Define initialization message for router contract
            astroport_factory: network.factoryAddress, // Example: Define factory contract address
            whitelist_code_id: network.whitelistCodeID, // Example: Define whitelist code ID
            admin: chainConfigs.router.admin || chainConfigs.generalInfo.multisig // Example: Define admin address
        };
        console.log('Deploying Router...');
        let resp = await deployContract(
            furya,
            wallet,
            chainConfigs.router.admin || chainConfigs.generalInfo.multisig,
            join(ARTIFACTS_PATH, 'astroport_router.wasm'),
            routerInitMsg,
            'Router Label'
        );
        network.routerAddress = resp.shift().shift();
        writeArtifact(network, furya.config.chainID);
    }
}

async function uploadAndInitMaker(furya, wallet) {
    let network = readArtifact(furya.config.chainID);
    if (!network.makerAddress) {
        const makerInitMsg = {
            // Define initialization message for maker contract
            owner: chainConfigs.maker.initMsg.owner || chainConfigs.generalInfo.multisig, // Example: Define owner address
            factory_contract: network.factoryAddress, // Example: Define factory contract address
            staking_contract: network.stakingAddress, // Example: Define staking contract address
            astro_token: { token: { contract_addr: network.tokenAddress } }, // Example: Define astro token contract address
            admin: chainConfigs.maker.admin || chainConfigs.generalInfo.multisig // Example: Define admin address
        };
        console.log('Deploying Maker...');
        let resp = await deployContract(
            furya,
            wallet,
            chainConfigs.maker.admin || chainConfigs.generalInfo.multisig,
            join(ARTIFACTS_PATH, 'astroport_maker.wasm'),
            makerInitMsg,
            'Maker Label'
        );
        network.makerAddress = resp.shift().shift();
        writeArtifact(network, furya.config.chainID);
    }
}

async function uploadAndInitTreasury(furya, wallet) {
    let network = readArtifact(furya.config.chainID);
    if (!network.treasuryAddress) {
        const treasuryInitMsg = {
            // Define initialization message for treasury contract
            admin: chainConfigs.treasury.admin || chainConfigs.generalInfo.multisig // Example: Define admin address
        };
        console.log('Deploying Treasury...');
        let resp = await deployContract(
            furya,
            wallet,
            chainConfigs.treasury.admin || chainConfigs.generalInfo.multisig,
            join(ARTIFACTS_PATH, 'astroport_treasury.wasm'),
            treasuryInitMsg,
            'Treasury Label'
        );
        network.treasuryAddress = resp.shift().shift();
        writeArtifact(network, furya.config.chainID);
    }
}

async function uploadAndInitVesting(furya, wallet) {
    let network = readArtifact(furya.config.chainID);
    if (!network.vestingAddress) {
        const vestingInitMsg = {
            // Define initialization message for vesting contract
            vesting_token: { token: { contract_addr: network.tokenAddress } }, // Example: Define vesting token contract address
            owner: chainConfigs.vesting.initMsg.owner || chainConfigs.generalInfo.multisig, // Example: Define owner address
            admin: chainConfigs.vesting.admin || chainConfigs.generalInfo.multisig // Example: Define admin address
        };
        console.log('Deploying Vesting...');
        let resp = await deployContract(
            furya,
            wallet,
            chainConfigs.vesting.admin || chainConfigs.generalInfo.multisig,
            join(ARTIFACTS_PATH, 'astroport_vesting.wasm'),
            vestingInitMsg,
            'Vesting Label'
        );
        network.vestingAddress = resp.shift().shift();
        writeArtifact(network, furya.config.chainID);
    }
}

async function uploadAndInitGenerator(furya, wallet) {
    let network = readArtifact(furya.config.chainID);
    if (!network.generatorAddress) {
        const generatorInitMsg = {
            // Define initialization message for generator contract
            astro_token: { token: { contract_addr: network.tokenAddress } }, // Example: Define astro token contract address
            vesting_contract: network.vestingAddress, // Example: Define vesting contract address
            factory: network.factoryAddress, // Example: Define factory contract address
            whitelist_code_id: network.whitelistCodeID, // Example: Define whitelist code ID
            owner: wallet.key.accAddress, // Example: Define owner address
            admin: chainConfigs.generator.admin || chainConfigs.generalInfo.multisig // Example: Define admin address
        };
        console.log('Deploying Generator...');
        let resp = await deployContract(
            furya,
            wallet,
            chainConfigs.generator.admin || chainConfigs.generalInfo.multisig,
            join(ARTIFACTS_PATH, 'astroport_generator.wasm'),
            generatorInitMsg,
            'Generator Label'
        );
        network.generatorAddress = resp.shift().shift();
        writeArtifact(network, furya.config.chainID);
    }
}

async function setupVestingAccounts(furya, wallet) {
    let network = readArtifact(furya.config.chainID);
    if (!network.vestingAccountsRegistered) {
        const registrationMsg = {
            // Define registration message for vesting accounts
            register_vesting_accounts: {
                vesting_accounts: [
                    {
                        address: network.generatorAddress // Example: Define the address of the generator contract
                    }
                ]
            }
        };
        console.log('Registering vesting accounts...');
        await executeContract(furya, wallet, network.tokenAddress, {
            send: {
                contract: network.vestingAddress,
                amount: chainConfigs.vesting.registration.amount,
                msg: toEncodedBinary(registrationMsg)
            }
        });
        network.vestingAccountsRegistered = true;
        writeArtifact(network, furya.config.chainID);
    }
}


await main();
