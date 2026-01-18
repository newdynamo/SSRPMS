export interface MCode {
    code: string;
    name: string;
}

export interface EVCode {
    code: string;
    name: string;
    description?: string; // Added description
    mCode: string; // references MCode
    priority?: number; // Added priority
    validTCodes: string[];
    validRCodes: string[];
}

export interface TCode {
    code: string;
    name: string;
    description: string;
    priority?: number;
    unit?: string; // Added unit
}

export interface RCode {
    code: string;
    name: string;
    description?: string; // Mapped from user "Description"
    type: 'string' | 'number' | 'text';
    unit: string;
    priority?: number;
    group?: string; // Added group
}

export interface ECode {
    code: string;
    name: string;
    applicability: string;
    numberRange: string;
}

export interface FCode {
    code: string;
    name: string;
    lcv: number;
    remark?: string;
}

export interface LCode {
    code: string;
    name: string;
    remark?: string;
}

export interface WCode {
    code: string;
    name: string;
    description: string;
    unit: string;
    priority?: number;
}

export interface Report {
    id?: string;
    mCode: string;
    evCode: string;
    // Task values: Key is TCode, Value is time string "HH:mm" or "YYYY-MM-DD HH:mm"
    tasks: Record<string, string>;
    // Item values: Key is RCode, Value is the input
    items: Record<string, string | number>;
    submittedAt?: string;
}

export interface CodeData {
    mCodes: MCode[];
    evCodes: EVCode[];
    tCodes: TCode[];
    rCodes: RCode[];
    eCodes: ECode[];
    fCodes: FCode[];
    lCodes: LCode[];
    wCodes: WCode[];
}

export interface Ship {
    yard: string;
    hullNo: string;
    name: string;
    code: string;
    class: string;
    flag: string;
    deliveryDate: string;
    cargo: string;
    dwt: number;
    // Configuration
    equipment?: { code: string; installed: boolean; count: number; validFuels?: string[] }[];
    fuels?: { code: string; initialRob?: number }[]; // Array of FCode codes
    lubeOils?: { code: string; initialRob?: number }[]; // Array of LCode codes
    waters?: { code: string; initialRob?: number }[]; // Array of WCode codes
    tankCounts?: {
        cargo: number;
        ballast: number;
    };
    configSourceShipId?: string; // If set, use configuration (equipment, fuels, etc.) from this ship ID (code)
    customValues?: Record<string, string>; // Custom field values (Key = Label from global list)
}
