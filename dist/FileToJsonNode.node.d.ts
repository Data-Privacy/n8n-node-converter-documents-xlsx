import { IExecuteFunctions } from 'n8n-workflow';
/**
 * Custom n8n node: convert files to JSON/text
 * Supports DOCX, XML, YML, XLSX, CSV, PDF, TXT, PPTX, HTML
 */
declare class FileToJsonNode {
    description: {
        displayName: string;
        name: string;
        icon: string;
        group: string[];
        version: number;
        description: string;
        defaults: {
            name: string;
        };
        inputs: string[];
        outputs: string[];
        properties: ({
            displayName: string;
            name: string;
            type: string;
            default: string;
            description: string;
            typeOptions?: undefined;
            displayOptions?: undefined;
        } | {
            displayName: string;
            name: string;
            type: string;
            default: number;
            description: string;
            typeOptions: {
                minValue: number;
                maxValue: number;
            };
            displayOptions?: undefined;
        } | {
            displayName: string;
            name: string;
            type: string;
            default: boolean;
            description: string;
            displayOptions: {
                show: {};
            };
            typeOptions?: undefined;
        })[];
    };
    /**
     * Main execution method for n8n node
     */
    execute(this: IExecuteFunctions): Promise<unknown[]>;
}
declare const nodeClass: typeof FileToJsonNode;
export { nodeClass as FileToJsonNode };
