import { IExecuteFunctions } from 'n8n-workflow';
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
        properties: ({
            displayName: string;
            name: string;
            type: string;
            default: string;
            description: string;
            typeOptions?: undefined;
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
        })[];
    };
    /**
     * Основной метод выполнения нода n8n
     */
    execute(this: IExecuteFunctions): Promise<unknown[]>;
}
export { FileToJsonNode };
