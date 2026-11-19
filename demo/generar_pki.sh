#!/bin/bash
# Genera una PKI de PRUEBA (simula una ECEP) y firma un documento con CMS/PKCS#7. Ejecutar dentro de demo/
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -subj "/C=PE/O=PKI de Prueba UNDAC/CN=ECEP de Prueba" -days 365
openssl req -newkey rsa:2048 -nodes -keyout func.key -out func.csr -subj "/C=PE/O=Municipalidad de Prueba/CN=FUNCIONARIO PRUEBA/serialNumber=DNI12345678"
openssl x509 -req -in func.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out func.crt -days 365
printf 'RESOLUCION DE ALCALDIA N 001-2026\nExpediente EXP-2026-0001\nSe aprueba el registro de licencia de funcionamiento.\n' > resolucion.txt
openssl cms -sign -binary -in resolucion.txt -signer func.crt -inkey func.key -outform DER -out resolucion.p7s -nodetach
