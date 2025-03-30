"use client";

import { useEffect, useState } from 'react';
import { getOpenApiDocs } from '@/lib/apiClient';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

export default function DocsPage() {
  const [spec, setSpec] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const docs = await getOpenApiDocs();
        setSpec(docs);
      } catch (err) {
        setError('Failed to load API documentation');
        console.error('Error fetching docs:', err);
      }
    };

    fetchDocs();
  }, []);

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (!spec) {
    return (
      <div className="p-4">
        <div>Loading documentation...</div>
      </div>
    );
  }

  return (
    <div className="docs-container">
      <SwaggerUI spec={spec} />
      <style jsx global>{`
        /* Base dark theme */
        .swagger-ui {
          background-color: #1a1a1a;
          color: #ffffff;
        }

        /* Header styles */
        .swagger-ui .topbar {
          background-color: #242424;
          border-bottom: 1px solid #333;
        }
        .swagger-ui .info {
          margin: 20px 0;
        }
        .swagger-ui .info .title {
          color: #ffffff;
          font-weight: 600;
        }
        .swagger-ui .info .title small.version-stamp {
          background-color: #4a4a4a;
          color: #ffffff;
        }
        .swagger-ui .info li, .swagger-ui .info p, .swagger-ui .info table {
          color: #ffffff;
        }

        /* Operation blocks */
        .swagger-ui .opblock-tag {
          color: #ffffff;
          border-bottom: 1px solid #333;
          font-size: 1.2em;
          font-weight: 600;
        }
        .swagger-ui .opblock {
          background: #242424;
          border: 1px solid #333;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
          margin: 0 0 10px;
        }
        .swagger-ui .opblock .opblock-summary {
          border-bottom: 1px solid #333;
        }
        .swagger-ui .opblock .opblock-summary-method {
          font-weight: 600;
        }
        .swagger-ui .opblock .opblock-summary-path {
          color: #ffffff;
          font-weight: 500;
        }
        .swagger-ui .opblock .opblock-summary-description {
          color: #ffffff;
          font-weight: 400;
        }
        .swagger-ui .opblock .opblock-summary-operation-id {
          color: #bbb;
        }
        .swagger-ui .opblock-description-wrapper p,
        .swagger-ui .opblock-external-docs-wrapper p,
        .swagger-ui .opblock-title_normal p {
          color: #ffffff;
        }

        /* Parameters and models */
        .swagger-ui .parameter__name,
        .swagger-ui .parameter__type,
        .swagger-ui .parameter__deprecated,
        .swagger-ui .parameter__in,
        .swagger-ui .parameter__name span {
          color: #ffffff;
        }
        .swagger-ui .parameter__enum {
          color: #bbb;
        }
        .swagger-ui .model-box {
          background-color: #242424;
          border: 1px solid #333;
        }
        .swagger-ui .model .property {
          color: #ffffff;
        }
        .swagger-ui .model .property.primitive {
          color: #9cdcfe;
        }

        /* Form elements */
        .swagger-ui input[type=text],
        .swagger-ui textarea {
          background-color: #333;
          color: #ffffff;
          border: 1px solid #444;
        }
        .swagger-ui select {
          background-color: #333;
          color: #ffffff;
          border: 1px solid #444;
        }
        .swagger-ui .btn {
          background-color: #333;
          color: #ffffff;
          border: 1px solid #444;
        }

        /* Scheme container */
        .swagger-ui .scheme-container {
          background-color: #242424;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        /* Models section */
        .swagger-ui section.models {
          background-color: #242424;
          border: 1px solid #333;
        }
        .swagger-ui section.models.is-open h4 {
          border-bottom: 1px solid #333;
          color: #ffffff;
        }
        .swagger-ui .model-title {
          color: #ffffff;
          font-weight: 600;
        }

        /* Tables */
        .swagger-ui table tbody tr td {
          color: #ffffff;
          border-bottom: 1px solid #333;
        }
        .swagger-ui table thead tr td,
        .swagger-ui table thead tr th {
          color: #ffffff;
          border-bottom: 1px solid #333;
          font-weight: 600;
        }

        /* HTTP methods */
        .swagger-ui .opblock-get .opblock-summary-method { background: #2a5b87; }
        .swagger-ui .opblock-post .opblock-summary-method { background: #1d672f; }
        .swagger-ui .opblock-delete .opblock-summary-method { background: #8b2635; }
        .swagger-ui .opblock-put .opblock-summary-method { background: #6b4c1c; }
        .swagger-ui .opblock-patch .opblock-summary-method { background: #474725; }

        /* Response section */
        .swagger-ui .responses-inner h4,
        .swagger-ui .responses-inner h5 {
          color: #ffffff;
        }
        .swagger-ui .response-col_status {
          color: #ffffff;
          font-weight: 600;
        }
        .swagger-ui .response-col_description {
          color: #ffffff;
        }
        .swagger-ui .response-col_description p {
          color: #bbb;
        }
      `}</style>
    </div>
  );
}
