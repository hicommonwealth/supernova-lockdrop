pragma solidity >=0.4.21 <0.6.0;

contract Lock {
    // address owner; slot #0
    // address unlockTime; slot #1
    constructor (address owner, uint256 unlockTime) public payable {
        assembly {
            sstore(0x00, owner)
            sstore(0x01, unlockTime)
        }
    }

    /**
     * @dev        Withdraw function once timestamp has passed unlock time
     */
    function () external payable { // payable so solidity doesn't add unnecessary logic
        assembly {
            switch gt(timestamp, sload(0x01))
            case 0 { revert(0, 0) }
            case 1 {
                switch call(gas, sload(0x00), balance(address), 0, 0, 0, 0)
                case 0 { revert(0, 0) }
            }
        }
    }
}

contract Lockdrop {
    // Time constants
    uint256 constant public LOCK_LENGTH_TERM = 1 days * 182;
    uint256 constant public LOCK_DROP_PERIOD = 1 days * 182;
    uint256 public LOCK_START_TIME;
    uint256 public LOCK_END_TIME;
    // ETH locking events
    event Locked(address indexed owner, uint256 eth, Lock lockAddr, bytes supernovaAddr, uint time);

    constructor(uint startTime) public {
        LOCK_START_TIME = startTime;
        LOCK_END_TIME = startTime + LOCK_DROP_PERIOD;
    }

    /**
     * @dev        Locks up the value sent to contract in a new Lock
     * @param      supernovaAddr   The bytes representation of the target cosmos key
     */
    function lock(bytes calldata supernovaAddr)
        external
        payable
        didStart
        didNotEnd
    {
        // Create ETH lock contract
        Lock lockAddr = (new Lock).value(msg.value)(msg.sender, now + LOCK_LENGTH_TERM);
        // ensure lock contract has at least all the ETH, or fail
        assert(address(lockAddr).balance >= msg.value);
        emit Locked(msg.sender, msg.value, lockAddr, supernovaAddr, now);
    }

    /**
     * @dev        Ensures the lockdrop has started
     */
    modifier didStart() {
        require(now >= LOCK_START_TIME, 'Lockdrop has not started');
        _;
    }

    /**
     * @dev        Ensures the lockdrop has not ended
     */
    modifier didNotEnd() {
        require(now <= LOCK_END_TIME, 'Lockdrop has ended');
        _;
    }
}