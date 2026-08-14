"""
Tests del servicio de contacts (whitelist de contactos).
"""
import pytest
from app.core.contacts_service import normalize_contact, validate_contact


class TestNormalizeContact:
    def test_email_lowercased(self):
        assert normalize_contact("email", "User@Example.COM") == "user@example.com"

    def test_email_stripped(self):
        assert normalize_contact("email", "  user@example.com  ") == "user@example.com"

    def test_phone_e164(self):
        assert normalize_contact("phone", "+34 612 345 678") == "+34612345678"

    def test_phone_adds_plus(self):
        assert normalize_contact("phone", "34612345678") == "+34612345678"

    def test_phone_removes_dashes(self):
        assert normalize_contact("phone", "+34-612-345-678") == "+34612345678"

    def test_other_types_stripped(self):
        assert normalize_contact("slack_channel", "  #general  ") == "#general"


class TestValidateContact:
    def test_valid_email(self):
        assert validate_contact("email", "user@example.com") is True

    def test_invalid_email(self):
        assert validate_contact("email", "not-an-email") is False

    def test_valid_phone(self):
        assert validate_contact("phone", "+34612345678") is True

    def test_invalid_phone(self):
        assert validate_contact("phone", "12345") is False

    def test_phone_needs_plus(self):
        assert validate_contact("phone", "34612345678") is False

    def test_other_type_nonempty(self):
        assert validate_contact("slack_channel", "#general") is True

    def test_other_type_empty(self):
        assert validate_contact("slack_channel", "") is False


@pytest.mark.asyncio
async def test_add_and_list_contacts(async_client, clean_test_data):
    """Agrega un contacto y lo lista."""
    from app.core.contacts_service import add_contact, list_contacts

    await add_contact(
        user_id="test_user_a",
        contact_type="email",
        value="team@company.com",
        display_name="Team",
        authorized_for=["calendar_create_event"],
    )

    contacts = await list_contacts("test_user_a")
    assert len(contacts) >= 1
    assert any(c["value"] == "team@company.com" for c in contacts)


@pytest.mark.asyncio
async def test_is_authorized_check(async_client, clean_test_data):
    """Verifica si un contacto está autorizado para un tool."""
    from app.core.contacts_service import add_contact, is_authorized

    await add_contact(
        user_id="test_user_a",
        contact_type="phone",
        value="+34612345678",
        authorized_for=["whatsapp_send_message"],
    )

    assert await is_authorized("test_user_a", "whatsapp_send_message", "+34612345678") is True
    assert await is_authorized("test_user_a", "whatsapp_send_message", "+34000000000") is False
    assert await is_authorized("test_user_a", "calendar_create_event", "+34612345678") is False


# ------------------------------------------------------------------ QA-1
#
# El escritor y el lector de la whitelist no hablaban el mismo idioma.
#
# `add_contact` guarda `display_name` VERBATIM y `value` pasado por
# `normalize_contact`; `is_authorized` buscaba `contact_value.lower().strip()`
# contra ambos campos. Mongo compara cadenas byte a byte, así que un contacto
# creado en /settings/contacts como «Ruben Lima» era invisible para el agente,
# que es justo el nombre con el que el agente lo llama. Y un teléfono tecleado
# con espacios no encontraba jamás su propio E.164.
#
# Estos tests fijan la simetría: el lector normaliza igual que el escritor por
# la rama `value`, y compara el nombre tal cual, sin distinguir mayúsculas.


@pytest.mark.asyncio
async def test_qa1_el_nombre_matchea_sin_importar_las_mayusculas(
    async_client, clean_test_data
):
    """El caso exacto del QA: contacto «Ruben Lima», agente que escribe su nombre."""
    from app.core.contacts_service import add_contact, is_authorized

    await add_contact(
        user_id="test_user_a",
        contact_type="phone",
        value="+34612345678",
        display_name="Ruben Lima",
        authorized_for=["whatsapp_send_message"],
    )

    # Tal cual lo guardó el usuario.
    assert await is_authorized(
        "test_user_a", "whatsapp_send_message", "Ruben Lima"
    ) is True
    # Y en minúsculas, que es como suele llegar del LLM.
    assert await is_authorized(
        "test_user_a", "whatsapp_send_message", "ruben lima"
    ) is True


@pytest.mark.asyncio
async def test_qa1_el_telefono_con_espacios_encuentra_su_e164(
    async_client, clean_test_data
):
    """El lector normaliza con la MISMA función que usó el escritor."""
    from app.core.contacts_service import add_contact, is_authorized

    await add_contact(
        user_id="test_user_a",
        contact_type="phone",
        value="+34612345678",
        display_name="Ruben Lima",
        authorized_for=["whatsapp_send_message"],
    )

    assert await is_authorized(
        "test_user_a", "whatsapp_send_message", "+34 612 345 678", "phone"
    ) is True


@pytest.mark.asyncio
async def test_qa1_un_nombre_con_parentesis_se_compara_literal(
    async_client, clean_test_data
):
    """El nombre se compara como texto, no como expresión regular.

    Sin `re.escape` los paréntesis serían un grupo de captura: «Ana (Madre)»
    pasaría a casar con «Ana Madre» —un contacto que el usuario nunca autorizó—
    y un nombre con `[` o `*` reventaría el driver con una regex inválida.
    """
    from app.core.contacts_service import add_contact, is_authorized

    await add_contact(
        user_id="test_user_a",
        contact_type="phone",
        value="+34600111222",
        display_name="Ana (Madre)",
        authorized_for=["whatsapp_send_message"],
    )

    assert await is_authorized(
        "test_user_a", "whatsapp_send_message", "Ana (Madre)", "phone"
    ) is True
    # El literal es literal: los paréntesis no son un grupo.
    assert await is_authorized(
        "test_user_a", "whatsapp_send_message", "Ana Madre", "phone"
    ) is False


@pytest.mark.asyncio
async def test_qa1_el_tipo_no_filtra_la_rama_del_nombre(async_client, clean_test_data):
    """Un nombre no tiene tipo: `type` sólo puede restringir la rama `value`.

    Las tools pasan `contact_type="phone"` (shared_tools.py), así que si el
    filtro se aplicara a todo el `$or` descartaría cualquier match por nombre.
    """
    from app.core.contacts_service import add_contact, is_authorized

    await add_contact(
        user_id="test_user_a",
        contact_type="phone",
        value="+34612345678",
        display_name="Ruben Lima",
        authorized_for=["whatsapp_send_message"],
    )

    assert await is_authorized(
        "test_user_a", "whatsapp_send_message", "Ruben Lima", "phone"
    ) is True


@pytest.mark.asyncio
async def test_qa1_un_email_sin_tipo_declarado_sigue_matcheando(
    async_client, clean_test_data
):
    """Test de aprobación: fija la conducta de HOY para no romperla al arreglar.

    El lector viejo hacía `.lower()` a ciegas, y eso acertaba con los emails.
    Sustituirlo por `normalize_contact(type, ...)` sin más perdería ese acierto
    cuando la llamada no declara `type`, así que la rama `value` prueba también
    la forma en minúsculas. Verde antes y después del cambio.
    """
    from app.core.contacts_service import add_contact, is_authorized

    await add_contact(
        user_id="test_user_a",
        contact_type="email",
        value="Team@Company.com",
        authorized_for=["calendar_create_event"],
    )

    assert await is_authorized(
        "test_user_a", "calendar_create_event", "TEAM@company.com"
    ) is True


@pytest.mark.asyncio
async def test_qa1_el_contacto_sin_permiso_para_la_tool_sigue_denegado(
    async_client, clean_test_data
):
    """La simetría no abre la mano: `authorized_for` sigue mandando.

    Red de no-regresión — verde antes y después del cambio.
    """
    from app.core.contacts_service import add_contact, is_authorized

    await add_contact(
        user_id="test_user_a",
        contact_type="phone",
        value="+34612345678",
        display_name="Ruben Lima",
        authorized_for=["whatsapp_send_notification"],
    )

    assert await is_authorized(
        "test_user_a", "whatsapp_send_message", "Ruben Lima"
    ) is False
    assert await is_authorized(
        "test_user_a", "whatsapp_send_message", "+34612345678", "phone"
    ) is False
    # Y el contacto de OTRO usuario nunca es mío.
    assert await is_authorized(
        "test_user_b", "whatsapp_send_notification", "Ruben Lima"
    ) is False


@pytest.mark.asyncio
async def test_invalid_email_rejected():
    """Email inválido es rechazado."""
    from app.core.contacts_service import add_contact

    with pytest.raises(ValueError, match="Formato de email inválido"):
        await add_contact(
            user_id="test_user_a",
            contact_type="email",
            value="not-an-email",
        )
