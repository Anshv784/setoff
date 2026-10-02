// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {Setoff} from "../src/Setoff.sol";

/// arc-forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --private-key $PK
contract Deploy is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000; // same on both networks
    address constant EURC_MAINNET = 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1;
    address constant EURC_TESTNET = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;

    function run() external returns (Setoff setoff) {
        address eurc;
        if (block.chainid == 5042) eurc = EURC_MAINNET;
        else if (block.chainid == 5042002) eurc = EURC_TESTNET;
        else revert("unsupported chain");

        address[] memory toks = new address[](2);
        toks[0] = USDC;
        toks[1] = eurc;

        vm.startBroadcast();
        setoff = new Setoff(toks);
        vm.stopBroadcast();

        console2.log("Setoff deployed:", address(setoff));
    }
}
