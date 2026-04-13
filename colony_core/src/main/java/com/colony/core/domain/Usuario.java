package com.colony.core.domain;

import java.sql.Date;
import java.util.Collection;
import java.util.Collections;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.security.core.GrantedAuthority;
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
    private String departamento;
    private Date fechaCreacion;
    private Boolean activo;

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return Collections.emptyList();
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
}
