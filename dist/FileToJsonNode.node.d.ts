interface N8nThis {
    getInputData: () => any[];
    getNodeParameter: (name: string, itemIndex: number, defaultValue?: any) => any;
    helpers: {
        getBinaryDataBuffer: (itemIndex: number, propertyName: string) => Promise<Buffer>;
    };
    logger?: {
        info: (...args: any[]) => void;
    };
}
/**
 * Кастомный нод для n8n: конвертация файлов в JSON/текст
 * Поддержка DOC, DOCX, XML, XLS, XLSX, CSV, PDF, TXT, PPT, PPTX, HTML/HTM
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
        properties: {
            displayName: string;
            name: string;
            type: string;
            default: string;
            description: string;
        }[];
    };
    /**
     * Основной метод выполнения нода n8n
     * @this {import('n8n-workflow').IExecuteFunctions}
     * @returns {Promise<Array>} - массив результатов для n8n
     */
    execute(this: N8nThis): Promise<any[]>;
}
export { FileToJsonNode };
