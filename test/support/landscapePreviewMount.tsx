import React from 'react';
import {createRoot} from 'react-dom/client';
import {CandidateDocumentPreview} from '../../src/components/A4DocumentPreview.tsx';

export function mountLandscapePreview(base64:string,sha256:string):void{
 const binary=atob(base64),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
 const host=document.createElement('div');
 host.dataset.landscapePreviewProbe='true';
 host.style.width='100%';
 host.style.maxWidth='100%';
 host.style.boxSizing='border-box';
 document.body.append(host);
 createRoot(host).render(<CandidateDocumentPreview bytes={bytes} sha256={sha256} instanceId="synthetic-landscape"/>);
}
