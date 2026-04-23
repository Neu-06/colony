package com.colony.core.domain;

import java.sql.Date;
import java.util.Collection;
import java.util.List;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

@Data
@NoArgsConstructor
@Document(collection = "usuarios")
public class Usuario implements UserDetails {

    @Id
    private String id;
    private String nombres;
    private String apellidos;
    private String telefono;
    private String email;
    private String password;
    private String rol;
    private String departamentoId;
    private Date fechaCreacion;
    private Boolean activo;

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + normalizeRole()));
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }

    private String normalizeRole() {
        if (rol == null || rol.isBlank()) {
            return "FUNCIONARIO";
        }
        return rol.trim().toUpperCase();
    }
}
