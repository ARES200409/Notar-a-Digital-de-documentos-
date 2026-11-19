// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title NotariaDigital
 * @notice Libro de registro inmutable para documentos administrativos firmados
 *         digitalmente (Firma Digital PKI estatal). On-chain solo se guarda el
 *         hash SHA-256, el sello de tiempo y la direccion autorizada; el
 *         documento y los datos personales permanecen off-chain.
 */
contract NotariaDigital {
    // ---------------------------------------------------------------- Tipos
    enum Estado { Inexistente, Pendiente, Vigente, Anulado }

    struct Documento {
        bytes32 hashDoc;            // SHA-256 (documento firmado + metadatos)
        string  tipo;               // p. ej. "RESOLUCION", "LICENCIA", "CONTRATO"
        string  expediente;         // identificador administrativo
        string  uri;                // referencia off-chain opcional (p. ej. CID de IPFS)
        address registrador;        // funcionario que presento el hash
        uint64  fechaRegistro;      // block.timestamp del registro
        uint64  fechaVigencia;      // block.timestamp al alcanzar las aprobaciones
        uint8   aprobacionesReq;    // aprobaciones necesarias (>=1)
        uint8   aprobaciones;       // aprobaciones acumuladas
        Estado  estado;
        string  motivoAnulacion;
    }

    // -------------------------------------------------------------- Estado
    address public administrador;
    mapping(address => bool) public autorizado;
    mapping(bytes32 => Documento) private documentos;
    mapping(bytes32 => mapping(address => bool)) private yaAprobo;
    uint256 public totalDocumentos;

    // -------------------------------------------------------------- Eventos
    event FuncionarioAutorizado(address indexed funcionario, bool habilitado);
    event DocumentoRegistrado(bytes32 indexed hashDoc, address indexed registrador, string tipo, string expediente, uint64 fecha);
    event DocumentoAprobado(bytes32 indexed hashDoc, address indexed aprobador, uint8 aprobaciones, uint8 requeridas);
    event DocumentoVigente(bytes32 indexed hashDoc, uint64 fecha);
    event DocumentoAnulado(bytes32 indexed hashDoc, address indexed por, string motivo);
    event AdministracionTransferida(address indexed anterior, address indexed nuevo);

    // -------------------------------------------------------------- Errores
    error NoEsAdministrador();
    error NoAutorizado();
    error DocumentoYaRegistrado(bytes32 hashDoc);
    error DocumentoInexistente(bytes32 hashDoc);
    error EstadoInvalido(Estado actual);
    error HashInvalido();
    error AprobacionesInvalidas();
    error YaAprobo();
    error DireccionInvalida();

    // ------------------------------------------------------------ Modifiers
    modifier soloAdmin() {
        if (msg.sender != administrador) revert NoEsAdministrador();
        _;
    }

    modifier soloFuncionario() {
        if (!autorizado[msg.sender]) revert NoAutorizado();
        _;
    }

    constructor() {
        administrador = msg.sender;
        autorizado[msg.sender] = true;
        emit FuncionarioAutorizado(msg.sender, true);
    }

    // ----------------------------------------------------- Gestion de roles
    function autorizarFuncionario(address funcionario, bool habilitar) external soloAdmin {
        if (funcionario == address(0)) revert DireccionInvalida();
        autorizado[funcionario] = habilitar;
        emit FuncionarioAutorizado(funcionario, habilitar);
    }

    function transferirAdministracion(address nuevo) external soloAdmin {
        if (nuevo == address(0)) revert DireccionInvalida();
        emit AdministracionTransferida(administrador, nuevo);
        administrador = nuevo;
        autorizado[nuevo] = true;
    }

    // ------------------------------------------------------------ Registro
    /**
     * @param hashDoc          SHA-256 calculado off-chain
     * @param aprobacionesReq  1 = registro inmediato; >1 = requiere otros funcionarios
     */
    function registrarDocumento(
        bytes32 hashDoc,
        string calldata tipo,
        string calldata expediente,
        string calldata uri,
        uint8 aprobacionesReq
    ) external soloFuncionario {
        if (hashDoc == bytes32(0)) revert HashInvalido();
        if (aprobacionesReq == 0) revert AprobacionesInvalidas();
        if (documentos[hashDoc].estado != Estado.Inexistente) revert DocumentoYaRegistrado(hashDoc);

        Documento storage d = documentos[hashDoc];
        d.hashDoc = hashDoc;
        d.tipo = tipo;
        d.expediente = expediente;
        d.uri = uri;
        d.registrador = msg.sender;
        d.fechaRegistro = uint64(block.timestamp);
        d.aprobacionesReq = aprobacionesReq;
        d.aprobaciones = 1;                 // el registrador cuenta como primera aprobacion
        yaAprobo[hashDoc][msg.sender] = true;
        totalDocumentos += 1;

        emit DocumentoRegistrado(hashDoc, msg.sender, tipo, expediente, d.fechaRegistro);

        if (aprobacionesReq == 1) {
            d.estado = Estado.Vigente;
            d.fechaVigencia = d.fechaRegistro;
            emit DocumentoVigente(hashDoc, d.fechaVigencia);
        } else {
            d.estado = Estado.Pendiente;
        }
    }

    function aprobarDocumento(bytes32 hashDoc) external soloFuncionario {
        Documento storage d = documentos[hashDoc];
        if (d.estado == Estado.Inexistente) revert DocumentoInexistente(hashDoc);
        if (d.estado != Estado.Pendiente) revert EstadoInvalido(d.estado);
        if (yaAprobo[hashDoc][msg.sender]) revert YaAprobo();

        yaAprobo[hashDoc][msg.sender] = true;
        d.aprobaciones += 1;
        emit DocumentoAprobado(hashDoc, msg.sender, d.aprobaciones, d.aprobacionesReq);

        if (d.aprobaciones >= d.aprobacionesReq) {
            d.estado = Estado.Vigente;
            d.fechaVigencia = uint64(block.timestamp);
            emit DocumentoVigente(hashDoc, d.fechaVigencia);
        }
    }

    /// @notice No borra nada: cambia el estado y deja el motivo (trazabilidad).
    function anularDocumento(bytes32 hashDoc, string calldata motivo) external soloFuncionario {
        Documento storage d = documentos[hashDoc];
        if (d.estado == Estado.Inexistente) revert DocumentoInexistente(hashDoc);
        if (d.estado == Estado.Anulado) revert EstadoInvalido(d.estado);
        d.estado = Estado.Anulado;
        d.motivoAnulacion = motivo;
        emit DocumentoAnulado(hashDoc, msg.sender, motivo);
    }

    // --------------------------------------------------------- Verificacion
    function consultarDocumento(bytes32 hashDoc) external view returns (Documento memory) {
        return documentos[hashDoc];
    }

    function existe(bytes32 hashDoc) external view returns (bool) {
        return documentos[hashDoc].estado != Estado.Inexistente;
    }

    /// @notice Verificacion on-chain con el precompilado SHA-256 (solo para contenidos pequenos).
    function verificarContenido(bytes calldata contenido) external view returns (bool registrado, Estado estado) {
        bytes32 h = sha256(contenido);
        estado = documentos[h].estado;
        registrado = estado != Estado.Inexistente;
    }
}
