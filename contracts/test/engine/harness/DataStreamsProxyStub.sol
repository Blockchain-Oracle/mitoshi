// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// The Data Streams stub the engine spec names (A.6 "Verifiers: … Data Streams stub"): stands in for the VerifierProxy's
/// DON-signature check in unit tests by returning the report the test wraps (`payload = abi.encode(report)`). The real
/// proxy and a real report are exercised by `test/fork/Mainnet.DataStreams.fork.t.sol`.
contract DataStreamsProxyStub {
    bytes public lastParams;

    function verify(bytes calldata payload, bytes calldata parameterPayload) external returns (bytes memory) {
        lastParams = parameterPayload;
        return abi.decode(payload, (bytes));
    }
}
