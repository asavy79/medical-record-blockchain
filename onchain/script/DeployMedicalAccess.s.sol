// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MedicalAccessRegistry} from "../src/MedicalAccess.sol";

contract DeployMedicalAccess is Script {
    function run() public {
        vm.startBroadcast();
        new MedicalAccessRegistry();
        vm.stopBroadcast();
    }
}
