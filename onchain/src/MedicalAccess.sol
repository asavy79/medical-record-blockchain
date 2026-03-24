// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MedicalAccessRegistry {
    // Maps: Patient => Doctor => Is Allowed to access their profile?
    mapping(address => mapping(address => bool)) public permissions;

    // Maps: Patient => Record ID (from Postgres) => Doctor Address => That Doctor's Unique Encrypted Key
    mapping(address => mapping(uint256 => mapping(address => string)))
        private encryptedKeys;

    // --- Events ---
    event AccessGranted(address indexed patient, address indexed doctor);
    event AccessRevoked(address indexed patient, address indexed doctor);
    event KeyShared(
        address indexed patient,
        uint256 indexed recordId,
        address indexed doctor
    );

    // --- Profile Permissions ---

    function grantAccess(address _doctor) public {
        require(_doctor != msg.sender, "Cannot grant access to yourself");
        permissions[msg.sender][_doctor] = true;
        emit AccessGranted(msg.sender, _doctor);
    }

    function revokeAccess(address _doctor) public {
        permissions[msg.sender][_doctor] = false;
        emit AccessRevoked(msg.sender, _doctor);
    }

    function checkAccess(
        address _patient,
        address _doctor
    ) public view returns (bool) {
        return permissions[_patient][_doctor];
    }

    // --- File Key Management ---

    // 1. Store the custom-encrypted key for a specific doctor
    function shareKeyWithDoctor(
        address _patient,
        uint256 _recordId,
        address _doctor,
        string memory _encryptedFileKey
    ) public {
        // Only the patient or a doctor who already has profile access can push a key
        require(
            msg.sender == _patient || permissions[_patient][msg.sender],
            "Not authorized to share keys for this patient"
        );

        encryptedKeys[_patient][_recordId][_doctor] = _encryptedFileKey;

        emit KeyShared(_patient, _recordId, _doctor);
    }

    // 2. Retrieve the caller's SPECIFIC key for a file
    function getDoctorKey(
        address _patient,
        uint256 _recordId
    ) public view returns (string memory) {
        require(
            permissions[_patient][msg.sender],
            "Not authorized to access this patient's records"
        );

        return encryptedKeys[_patient][_recordId][msg.sender];
    }
}
